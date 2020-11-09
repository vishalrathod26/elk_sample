
from watcher import *
from wrapperjson import *
from kibana import *
import json

class KibanaAccess(Watcher):

    def __init__(self, source,session, elasticsearch_url, userId, password):
        self.elasticsearch_url = elasticsearch_url
        self.userId = userId
        self.password = password
        self.session = session
        self.kib_environment = source['fields']["environment"]
        self.kibana_space = source['fields']["kibana_space"]
        self.status = source['fields']["status"]
        self.request = source['fields']["request"]
        self.action = source['fields']["action"]
        self.active_directory_group = source['fields']["active_directory_group"]
        self.access_level = source['fields']["access_level"]
        self.metadata = {}
        #self.init_config_file()

    def val_kib_env(self, v):
        if v != "Non-Production" and v != "Production": raise Exception(
            "Environment " + v + " should be Production or Non-Production")
        self._kib_environment = v
        self.metadata["Environment:"] = v

    # def val_kibana_space(self, v):
    #     if not v: raise Exception("kibana_space should not be null or empty")
    #     kib = Kibana()
    #     if not kib.space_exists(v, self._session): raise Exception(
    #         "kibana_space: space " + str(v) + " not in kibana")
    #     self._kibana_space = v
    #     self.metadata["Kibana Space:"] = v

    #validate status
    def val_status(self, v):
        if v != "Requested" and v != "Implemented": raise Exception("Status " + v + " should be Requested or Implemented")
        self._status = v
        self.metadata["Status:"] = v

    #validate request
    def val_request(self, v):
        if not v: raise Exception("request should not be null or empty")
        self._request = v
        self.metadata["Request:"] = v

    #validate action
    def val_action(self, v):
        if v != "Add" and v != "Remove": raise Exception(
            "Action " + v + " should be Add or Remove")
        self._action = v
        self.metadata["Action:"] = v

    #validate active directory group
    def val_active_directory_group(self, v):
        if not v: raise Exception("Active Directory Group should not be null or empty")
        self._active_directory_group = v
        self.metadata["Active Directory Group:"] = v

    #validate access level
    def val_access_level(self, v):
        if not v: raise Exception("Access Level should not be null or empty")
        self.access_level = v
        env = self.copy(self.kib_environment)
        if env == "Production" and "Write" in v:
            raise Exception("Production Environment prohibits write access")
        self.metadata["Access Level:"] = v

    #perform all validations
    def all_validation(self):
        self.val_kib_env(self.kib_environment)
        #self.val_kibana_space(self.kibana_space)
        self.val_status(self.status)
        self.val_request(self.request)
        self.val_action(self.action)
        self.val_active_directory_group(self.active_directory_group)
        self.val_access_level(self.access_level)
        #self.val_kib_space(self.kibana_space)

    #Checks the kibana space, access level requested, and environment, and searches index for an existing role_mapping with
    #the name convention of kibana-space_access-level_environment. Returns a json of the search result, formatted space name, formatted access level, and formatted environment
    def rolemap_get(self):
        if self.access_level.lower() == "read":
            role_access_level = "read"
        elif self.access_level.lower() == "read/write":
            role_access_level = "write"
        if self.kib_environment.lower() == "non-production":
            role_env = "np"
        elif self.kib_environment.lower() == "production":
            role_env = "prod"

        space_name = self.kibana_space.lower().replace(" ", "_").replace("-", "_")
        map_name = space_name+'_'+role_access_level+'_'+role_env+'_role_mapping'
        rolemap_data = self.elasticsearch_url+'/_security/role_mapping/'+map_name
        role_req = self.session.get(rolemap_data, auth=(self.userId, self.password)).json()
        return role_req, map_name, space_name, role_access_level, role_env

    #converts a dict to a json file and posts as a new rolemap in kibana
    def rolemap_post(self, rolemap_dict, map_conv):
        headers = {
            'Content-Type': 'application/json',
        }
        json_rolemap = json.dumps(rolemap_dict, indent=3)
        response_rm = self.session.post(self.elasticsearch_url + '/_security/role_mapping/' + map_conv, headers=headers, data=json_rolemap)

        if response_rm.status_code == 200 or response_rm.status_code == 201:
            return True
        else:
            return False

    #converts dict to json and (PUT) updates an existing rolemap in kibana
    def rolemap_put(self, rolemap_dict, map_conv):
        headers = {
            'Content-Type': 'application/json',
        }
        json_rolemap = json.dumps(rolemap_dict, indent=3)
        response_rm = self.session.put(self.elasticsearch_url + '/_security/role_mapping/' + map_conv, headers=headers, data=json_rolemap)
        if response_rm.status_code == 200 or response_rm.status_code == 201:
            return True
        else:
            return False

    #converts dict to json and updates the kibana request in snow-watchmaker
    def request_put(self, doc_dict, request_id):
        headers = {
            'Content-Type': 'application/json',
        }
        update_doc = json.dumps(doc_dict)
        response_sw = self.session.put(self.elasticsearch_url + '/snow-watchmaker/_doc/' + request_id, headers=headers, data=update_doc)

        if response_sw.status_code == 200 or response_sw.status_code == 201:
            return True
        else:
            return False
