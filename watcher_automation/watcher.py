from wrapperjson import *
from index import *
from kibana import *
import configparser
import requests
import pathlib
import re

#Base Class for all Watchers
#
#
#
class Watcher(WrapperJson):

    template = None
    condition_whitelist = None

    def __init__(self, watcher_json=None):
        super().__init__(watcher_json)

    def deploy(self, session, watch_id, elasticsearch_url="http://elasticsearch-ingress.elasticsearch.svc.cluster.local:80"):

        headers = {
            'Content-Type': 'application/json' 
        }
        params = (                        
            ('pretty', ''),                    
        )
        try:
            response  = session.put(elasticsearch_url+'/_watcher/watch/'+watch_id, headers=headers,params=params, data=json.dumps(self.get_value()))
            if response.status_code == 200:
                return True

            elif response.status_code == 201:
                return True

            else:
                return False

        except:
            return False

    def deactivate(self, session, watch_id, elasticsearch_url="http://elasticsearch-ingress.elasticsearch.svc.cluster.local:80"):
        return session.post(elasticsearch_url+'/_watcher/watch/'+watch_id+'/_deactivate')

    def activate(self, session, watch_id, elasticsearch_url="http://elasticsearch-ingress.elasticsearch.svc.cluster.local:80"):
        return session.post(elasticsearch_url+'/_watcher/watch/'+watch_id+'/_activate')

    def watcher_exists_in_elasticsearch(self, session, watch_id, elasticsearch_url="http://elasticsearch-ingress.elasticsearch.svc.cluster.local:80"):
        response = session.get(elasticsearch_url+'/_watcher/watch/'+watch_id).json()
        return response["found"]
            
    def init_config_file(self):
        config = configparser.ConfigParser()
        path = "/etc/config/"+self.__class__.__name__+".ini"
        file = pathlib.Path(path)
        if not file.exists (): 
            raise Exception(self.__class__.__name__+" does not have config file")
        config.read(path)
        self._index=config[self._environment]["index"]
        self.get_value("input","search","request","indices").append(self._index)
        self._u_environment=config[self._environment]["u_environment"]
        self.set_value(self._u_environment,"metadata", "u_environment")
        self._caller_id=config[self._environment]["caller_id"]
        self.set_value(self._caller_id, "metadata", "caller_id")
        self._account_name=config[self._environment]["account_name"]
        self.set_value(self._account_name, "metadata", "account_name")
        self._kibana_url=config[self._environment]["kibana_url"]
        self.set_value(self._kibana_url, "metadata", "kibana_url")

    def validate_trigger(self):
        return self.validate_using_template("trigger")

    def validate_condition(self):
        return self.validate_using_whitelist("condition")

    def validate_actions(self):
        return self.validate_using_template("actions")

    def validate_transform(self):
        if self.validate_using_template("transform") != []:
            return ["transform validation failed"]
        else:
            return []

    def validate_input(self, elasticsearch_url, user, password, allowed_index):
        all_paths = list(self.get_all_paths(self.get_value("input"),""))
        if "search->request->body->query->bool->filter->range->@timestamp->gte->now-5m" not in all_paths:
            return ["input->search->request->body->query->bool->filter->range->@timestamp->gte->now-5m required"]
        input_non_whitelist_keys = self.validate_using_whitelist("input")
        indices = []
        for path in all_paths:
            if "search->request->indices->" in path:
                indices.append(path.split("->")[-1])
                if path.split("->")[-1] != allowed_index:
                    return["only index allowed is "+allowed_index+" ... index: "+path.split("->")[-1]+" found"]
    
        for key in input_non_whitelist_keys:
            existing_field = False
            for index in indices:
                response = requests.get(elasticsearch_url+'/'+index+'/_mapping/field/'+key, auth=(user,password)).json()
                for index_name in response:
                    if "mappings" in response[index_name]:
                        if  key in response[index_name]["mappings"]:
                            existing_field = True
            if not existing_field:
                res = str(key)+" is not a field in indices "+str(indices)+" or a whitelisted key field for input" 
                return [res]
        #Logically if it gets to here the list should be empty        
        return []

    def validate_using_template(self, section, temp=None):
        template = self.__class__.template
        if temp:
            template = temp
        return self.deep_match(self.get_value(section), template.get_value(section)) 


    def validate_using_whitelist(self, section ,w_list=None): 
        whitelist = self.__class__.whitelist
        section_whitelist = dict()
        if section in whitelist:
            section_whitelist = whitelist[section]
        if w_list:
            section_whitelist = w_list

        section_obj = self.get_value(section)
        section_keys = self.get_all_keys(section_obj)
        illegal_keys = []
        for key in section_keys:
            if key not in section_whitelist:
                illegal_keys.append(key)
        return illegal_keys
        
    def set_template(self, template):
        self.__class__.template = WrapperJson(template)

    def init_whitelist_keys(self):

        config = configparser.ConfigParser()
        config.read("/etc/config/watchmaker_config.ini")
        section = "default"
        if config.has_section(self.__class__.__name__):
            section = self.__class__.__name__
       
        condition_whitelist_string = "" 
        if config.has_option(section, "condition_whitelist_string"):
            condition_whitelist_string = config[section]["condition_whitelist_string"] 
        elif config.has_option("default", "condition_whitelist_string"):
            condition_whitelist_string = config["default"]["condition_whitelist_string"]
        else:
            raise ProblemWithINIFile("Couldnt find condition_whitelist_string in "+section+" or default")
        self.set_whitelist_keys("condition", condition_whitelist_string)

        input_whitelist_string = "" 
        if config.has_option(section, "input_whitelist_string"):
            input_whitelist_string = config[section]["input_whitelist_string"] 
        elif config.has_option("default", "input_whitelist_string"):
            input_whitelist_string = config["default"]["input_whitelist_string"]
        else:
            raise ProblemWithINIFile("Couldnt find input_whitelist_string in "+section+" or default")
        self.set_whitelist_keys("input", input_whitelist_string)


    def set_whitelist_keys(self, section, whitelist_key_string):
        section_list = whitelist_key_string.split(",")
        self.__class__.whitelist[section] = section_list


    @property
    def application_ci(self):
        return self._application_ci

    @application_ci.setter
    def application_ci(self, v):
        if not v: raise Exception("application_ci should not be null or empty")
        self._application_ci = v
        self.set_value(v,"metadata", "application_ci")

    @property
    def default_criticality(self):
        return self._default_criticality

    @default_criticality.setter
    def default_criticality(self, v):
        if v != "MINOR" and v != "MAJOR" and v != "CRITICAL": raise Exception("default criticality should be MINOR, MAJOR, or CRITICAL. Current value: "+str(v))
        self._default_criticality = v
        self.set_value(v,"metadata", "default_criticality")

    @property
    def default_desciption(self):
        return self._default_desciption

    @default_desciption.setter
    def default_desciption(self, v):
        if not v: raise Exception("default_desciption should not be null or empty")
        self._default_desciption = v
        self.set_value(v,"metadata", "default_description")

    @property
    def application_name(self):
        return self._application_name

    @application_name.setter
    def application_name(self, v):
        if not v: raise Exception("application_name should not be null or empty")
        self._application_name = v
        self.set_value(v,"metadata", "application_name")

    @property
    def KBA(self):
        return self._KBA

    @KBA.setter
    def KBA(self, v):
        self._KBA = v
        self.set_value(v,"metadata", "KBA")

    @property
    def environment(self):
        return self._environment

    @environment.setter
    def environment(self, v):
        if v != "Non-Production" and v != "Production": raise Exception("Environment "+v+" should be Production or Non-Production")
        self._environment = v

    @property
    def support_group(self):
        return self._support_group

    @support_group.setter
    def support_group(self, v):
        if not v : raise Exception("Support group "+v+" should not be empty or null")
        self._support_group = v
        self.set_value(v,"metadata", "support_group")

    @property
    def alert_email(self):
        return self._alert_email

    @alert_email.setter
    def alert_email(self, eml):
        if "@****.com" not in eml : raise Exception("Email "+eml+" should include @****.com")
        self._alert_email = eml
        self.set_value(eml,"metadata", "email")

class EmailSnowIncidentHTMLTableWatcher(Watcher):

    template = None
    whitelist = dict()

    def __init__(self, watcher_json=None):
        if watcher_json:
            super().__init__(watcher_json)

    def modify_template(self):
        self.__class__.template.delete_value("actions","send_email","email","to") 
    
    def validate_actions(self, temp=None):
        template = self.__class__.template
        if temp:
            template = temp
        
        #Copy and remove email to list before check
        actions_dict = self.copy(self.get_value("actions"))
        actions = WrapperJson(actions_dict)
        
        actions.delete_value("send_email","email","to")

        return self.deep_match(actions.get_value(), template.get_value("actions"))

class MFLogWatcher(Watcher):

    def __init__(self, source, session, watcher_json):
        super().__init__(watcher_json)
        self._session = session
        self.environment = source["environment"]
        self.init_config_file()
        self.alert_email = source["alert_email"]
        self.support_group = source["support_group"]
        self.KBA = source["KBA"]
        self.application_ci = source["application_ci"]
        self.application_name = source["application_name"]
        self.default_desciption = source["default_description"]
        self.system_name = source["system_name"]
        self.default_criticality = source["default_criticality"]
        self.ignore_exception = source["ignore_exception"]
        self.known_incidents = source["known_incidents"]
        

    @property
    def known_incidents(self):
        return self._known_incidents

    @known_incidents.setter
    def known_incidents(self, v):
        if not isinstance(v, list): raise Exception("known_incidents should be a list")
        for item in v:
            index = Index(self._index)
            if not index.field_exists(item["field"], self._session): raise Exception("known_incidents: field "+item["field"]+" not in index "+self._index)
            if not item["substring"]: raise Exception("known_incidents: must have a substring that is not null or empty")
            if not item["exception_description"]: raise Exception("known_incidents: must have an exception description that is not null or empty")
            if item["criticality"] != "MINOR" and item["criticality"] != "MAJOR" and item["criticality"] != "CRITICAL": raise Exception("known_incidents: criticality must be MINOR, MAJOR, or CRITICAL")
            if not re.match(r'^[A-Za-z0-9_]+$', item["id"]): raise Exception("known_incidents: id can only be alphanumerics and underscores")
        self._known_incidents = v 
        for item in v:
            self.get_value("metadata","known_incidents").append(item)
    @property
    def ignore_exception(self):
        return self._ignore_exception

    @ignore_exception.setter
    def ignore_exception(self, v):
        if not isinstance(v, list): raise Exception("ignore_exception should be a list")
        for item in v:
            index = Index(self._index)
            if not index.field_exists(item["field"], self._session): raise Exception("ignore_exception: field "+item["field"]+" not in index "+self._index)
            if not item["value"]: raise Exception(str(item)+ "ignore_exception: must have a value that is not null or empty")
        self._ignore_exception = v
        for item in v:
            d = {'match_phrase': {item["field"]:item["value"]}}
            self.get_value("input","search","request","body","query","bool","must_not").append(d)

    @property
    def system_name(self):
        return self._system_name

    @system_name.setter
    def system_name(self, v):
        if not v: raise Exception("system_name should not be null or empty")
        self._system_name = v
        self.set_value(v,"metadata", "system_name")





class CustomLogWatcher(Watcher):

    def __init__(self, source, session, watcher_json):
        super().__init__(watcher_json)
        self._session = session
        self.environment = source["environment"]
        self.init_config_file()
        self.alert_email = source["alert_email"]
        self.support_group = source["support_group"]
        self.KBA = source["KBA"]
        self.application_ci = source["application_ci"]
        self.application_name = source["application_name"]
        self.default_desciption = source["default_description"]
        self.default_criticality = source["default_criticality"]
        self.kibana_space = source["kibana_space"]
        self.kibana_columns = source["kibana_columns"]
        self.kibana_query_string = source["kibana_query_string"]
        self.watch_id = source["watch_id"]
        
    @property
    def kibana_space(self):
        return self._kibana_space

    @kibana_space.setter
    def kibana_space(self, v):
        if not v: raise Exception("kibana_space should not be null or empty")
        kib = Kibana()
        if not kib.space_exists(v, self._session): raise Exception("kibana_space: space "+str(v)+" not in kibana")
        self._kibana_space = v
        self.set_value("/s/"+str(v),"metadata", "kibana_space")


    @property
    def watch_id(self):
        return self._watch_id

    @watch_id.setter
    def watch_id(self, v):
        if not v: raise Exception("watch_id should not be null or empty")
        if not re.match(r'^[A-Za-z0-9_]+$', v): raise Exception("watch_id: id can only be alphanumerics and underscores")
        self._watch_id = v
      

    @property
    def kibana_columns(self):
        return self._kibana_columns

    @kibana_columns.setter
    def kibana_columns(self, v):
        if not isinstance(v, list): raise Exception("kibana_columns should be a list")

        kibana_columns_str = ""
        for item in v:
            index = Index(self._index)
            if not index.field_exists(item, self._session): raise Exception("kibana_columns: field "+item+" not in index "+self._index)
            kibana_columns_str = kibana_columns_str+item+","
        self._kibana_columns = v
        self.set_value(kibana_columns_str[:-1] ,"metadata", "kibana_columns")



    @property
    def kibana_query_string(self):
        return self._kibana_query_string

    @kibana_query_string.setter
    def kibana_query_string(self, v):
        if not v: raise Exception("kibana_query_string should not be null or empty")
        self._kibana_query_string = v
        self.set_value(v ,"metadata", "kibana_query_string")


    

class ProblemWithINIFile(Exception):
    """Raised when watcher has a hard time initializing with ini file"""
    pass

