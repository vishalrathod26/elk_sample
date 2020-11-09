# This script imports a set of common kibana objects (mentioned in common_objects.json) and imports them in all spaces listed
# excel file at SPACES_PATH
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
# NEXT_VERSION=https://****
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
# pip3 install ndjson
# run: python3 common_objects.py

import sys
import pandas as pd
import json
import ndjson
import requests
import os
from dotenv import load_dotenv

load_dotenv()
spaces_path = os.getenv('SPACES_PATH')
previous_version = os.getenv('PREVIOUS_VERSION')
next_version = os.getenv('NEXT_VERSION')
importauth = (os.getenv('KIBANA_IMPORTUSERNAME'), os.getenv('KIBANA_IMPORTPASSWORD'))
exportauth = (os.getenv('KIBANA_EXPORTUSERNAME'), os.getenv('KIBANA_EXPORTPASSWORD'))

# function to take an export of specified object
def export_object(version, auth, objects):
    headers = {
        'kbn-xsrf': 'true',
        "Content-Type": "application/json",
    }
    export_response = requests.post(version + '/api/saved_objects/_export', headers=headers,
                                    data=objects, auth=auth)

    export_data = export_response.json(cls=ndjson.Decoder)
    return {"object": export_data}


# function to take an export of specified dashboard
def export_dashboard(version, auth, params):
    headers = {
        'kbn-xsrf': 'true',
    }
    print(version + '/api/kibana/dashboards/export')

    export_response = requests.get(version + '/api/kibana/dashboards/export', headers=headers,
                                   params=params, auth=auth)
    print('Working on dashboard: ', params)

    if  export_response.status_code==200:
        print('Export complete.')
    else:
        print('something went wrong',export_response.json())
    imported_data = export_response.json()
    return imported_data


# function to import object (whose export was taken in def export_object function) in specified space
def import_object(version, auth, data, space_id):
    headers = {
        'kbn-xsrf': 'true',
        'Content-Type': 'application/json',
    }
    # for default space
    if space_id:
        url = version + '/s/' + space_id + '/api/kibana/dashboards/import'
    else:
        url = version + '/api/kibana/dashboards/import'

    response = requests.post(url, headers=headers,
                             data=data, auth=auth)
    return response.json()

# function to import dashboard (whose export was taken in def export_dashboard function) in specified space
def import_dashboard(version, auth, data, space_id):
    headers = {
        'kbn-xsrf': 'true',
        'Content-Type': 'application/json',
    }
    params = (('force', True),)
    # print('metric_beat_count',data.count('metricbeat-*'))
    print('Initiating import of dashboard in space: ', space_id)
    # for default space
    if not space_id:
        url = version +  '/api/kibana/dashboards/import'
    else:
        url = version + '/s/' + space_id + '/api/kibana/dashboards/import'
    response = requests.post(url, headers=headers,
                             data=data, auth=auth, params=params)
    if response.status_code == 200:
        print('Import done.')
    else:
        print('Something went wrong',response.json())
    return response
# list of all unique spaces
spaces_ids = set(pd.read_csv(spaces_path).fillna('')['kibana space name'])
# read common objects ids
with open('common_objects.json') as f:
    common_objects = json.load(f)
# read index patterns to be replaced
try:
    with open('change.json') as f:
        changed_names = json.load(f)
except Exception as err:
    print(err)
    sys.exit()

dashboards = common_objects.get('dashboards')
other_objects = common_objects.get('objects').get('objects')

dashboards_params = []

for dashboard in dashboards:
    dashboards_params.append(('dashboard', dashboard))
if dashboards:
    # call export_dashbaord function and store response in imported_data
    imported_data= json.dumps(export_dashboard(previous_version, exportauth, dashboards_params))

    for space_id in spaces_ids:
        imported_data_replace  =  imported_data
        for name in changed_names:
            if space_id:
                # replace old index patterns with latest ones
                imported_data_replace = imported_data_replace.replace(name, changed_names.get(name).replace('<sid>', space_id))
                print('replacing index pattern: ', name, 'with', changed_names.get(name).replace('<sid>', space_id))
            if not space_id:
                # for default space
                imported_data_replace = imported_data_replace.replace(name, changed_names.get(name).replace('<sid>',
                                                                                                            space_id).replace('--*','-*'))
        import_dashboard(next_version, importauth, imported_data_replace, space_id)
if other_objects:
    other_objects_export = json.dumps(export_object(previous_version, exportauth, json.dumps(other_objects)))
    # for space_id in spaces_ids:
        # if dashboards:
            # print(import_object(next_version, auth, other_objects_export, space_id))