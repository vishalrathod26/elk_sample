This script imports a set of common kibana objects (mentioned in common_objects.json) and imports them in all spaces listed
excel file at SPACES_PATH
The .env file contains environment variables and values of:
path to excel sheet
kibana importusername (username of kibana from where export is taken)
kibana importpassword (password of kibana from where export is taken)
kibana exportusername (username of kibana to where import is to be done)
kibana exportpassword (password of kibana to where import is to be done)
previous version (url of original kibana from where export of objects will be taken)
previous version here (metrics.corelogic.net) has all the objects in one single space that is default space
next version (url of new kibana where import will be done)
spaces path: path to csv file containing list of all the spaces
Update values of KIBANA_USERNAME and KIBANA_PASSWORD with username and password of user
For example here we are taking objects from metrics.corelogic.net and migrating them in
spaces in https://****
Another file change.json contains all the index patterns that needs to be replaced,
Initially, there is only one index pattern that has to be replaced i.e metrcbeat-8 to metrics-<kibana-space>-*

Sample .env file:
EXCEL_PATH=kibana_export_metrics.xlsx
PREVIOUS_VERSION=https://****
NEXT_VERSION=https://****
KIBANA_IMPORTUSERNAME=xxxx
KIBANA_IMPORTPASSWORD=xxxx
KIBANA_EXPORTUSERNAME=xxxx
KIBANA_EXPORTPASSWORD=xxxx
SPACES_PATH=org_space_20200624.csv
Requirement:
pip3 install pandas
pip3 install requests
pip3 install python -dotenv
pip3 install xlrd
pip3 install ndjson
run: python3 common_objects.py