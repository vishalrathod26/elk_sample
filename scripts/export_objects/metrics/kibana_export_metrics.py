# This automation script reads the cataloged excel file (kibana_export_metrics.xlsx)
# takes the import of dashboards mentioned in it along with all of its child objects
# and imports them in the respective space mentioned with that dashboard
# The .env file contains environment variables and values of:
# path to excel sheet
# kibana importusername (username of kibana from where export is taken)
# kibana importpassword (password of kibana from where export is taken)
# kibana exportusername (username of kibana to where import is to be done)
# kibana exportpassword (password of kibana to where import is to be done)
# previous version (url of original kibana from where export of objects will be taken)
# previous version here (metrics.corelogic.net) has all the objects in one single space that is default space
# next version (url of new kibana where import will be done)
# spaces path: path to csv file containing list of all the spaces
# Update values of KIBANA_USERNAME and KIBANA_PASSWORD with username and password of user
# For example here we are taking objects from metrics.corelogic.net and migrating them in
# spaces in https://****
# Another file change.json contains all the index patterns that needs to be replaced,
# Initially, there is only one index pattern that has to be replaced i.e metrcbeat-8 to metrics-<kibana-space>-*
#
# Sample .env file:
# EXCEL_PATH=kibana_export_metrics.xlsx
# PREVIOUS_VERSION=https://****
# NEXT_VERSION=https:/****
# KIBANA_IMPORTUSERNAME=xxxx
# KIBANA_IMPORTPASSWORD=xxxx
# KIBANA_EXPORTUSERNAME=xxxx
# KIBANA_EXPORTPASSWORD=xxxx
# SPACES_PATH=org_space_20200624.csv
# Requirement:
# pip3 install pandas
# pip3 install requests
# pip3 install python -dotenv
# pip3 install xlrd
# run: python3 kibana_export_metrics.py

import pandas as pd
import json
import sys
import requests
import os
import re
import ndjson
from dotenv import load_dotenv

load_dotenv()

path = os.getenv('EXCEL_PATH')
previous_version = os.getenv('PREVIOUS_VERSION')
next_version = os.getenv('NEXT_VERSION')
importauth = (os.getenv('KIBANA_IMPORTUSERNAME'), os.getenv('KIBANA_IMPORTPASSWORD'))
exportauth = (os.getenv('KIBANA_EXPORTUSERNAME'), os.getenv('KIBANA_EXPORTPASSWORD'))

# get list of all already available spaces in 1.5
def list_all_spaces(version, auth):
    headers = {
        'kbn-xsrf': 'true',
    }
    response = requests.get(version + '/api/spaces/space', headers=headers,
                            auth=auth)
    data = response.json()
    #print(data)
    return [item.get('id') for item in data]

# function to take an export of specified dashboard
def export_dashboard(version, auth, params, sId):
    headers = {
        'kbn-xsrf': 'true',
    }
    print('Initiating export of dashboard')
    export_response= requests.get(version + '/api/kibana/dashboards/export', headers=headers,
                                 params=params, auth=auth)
    if  export_response.status_code==200:
        print('Export complete.')
    else:
        print('something went wrong',export_response.json())
    imported_data = export_response.json()
    return imported_data

# function to import the dashbaord, whose exportwas taken in export_dashboard functiom
def import_dashboard(version, auth, data, space_id):
    headers = {
        'kbn-xsrf': 'true',
        'Content-Type': 'application/json',
    }
    params = (('force', True),)
    print('Initiating import of dashboard in space: ', space)
    url = version + '/s/' + space_id + '/api/kibana/dashboards/import'
    response = requests.post(url, headers=headers,
                             data=data, auth=auth, params=params)
    if response.status_code == 200:
        print('Import done.')
    else:
        print('Something went wrong',response.json())
    return response

# read catalog excel sheet of objects to be migrated
df = pd.read_excel(path)
df = df[df['Parent Object'].isnull()]
df = df[df['Object ID'].notnull()]
unique_spaces_ids = set(df['Space ID'])
unique_object_ids = set(df['Object ID'])

spaces_present = set(list_all_spaces(next_version, importauth))
# read file containing index patterns to be replaced
try:
    with open('change.json') as f:
        changed_names = json.load(f)
except Exception as err:
    print(err)
    sys.exit()

for space in unique_spaces_ids:

    df_filtered = df[df['Space ID'] == space].to_dict('records')
    params = []
    for record in df_filtered:
        # call export_dashboard function and store output in imported_data
        imported_data= json.dumps(export_dashboard(previous_version, exportauth, params, space))
        imported_data_replace  =  imported_data
        object_id = record.get('Object ID')
        params.append(('dashboard', object_id))
        object_name = record.get('Object Name')
        print('Working on dashboard: ', object_name)
        imported_data = json.dumps(export_dashboard(previous_version, exportauth, params, space))
        for name in changed_names:
            # replace index patterns
            imported_data = imported_data.replace(name, changed_names.get(name).replace('<sid>', space))
            print('replacing index pattern: ', name, 'with', changed_names.get(name).replace('<sid>', space))
        import_dashboard(next_version, importauth, imported_data, space)