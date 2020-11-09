import json
import sys
from copy import deepcopy

class WrapperJson():
    def __init__(self, obj=None):
        try:
            if not obj:
                self._obj = dict()
            elif isinstance(obj, dict):
                self._obj = obj
            elif isinstance(obj, str):
                with open(obj) as json_file:
                    self._obj = json.load(json_file)
            else:
                raise ConstructorValueIncorrect("Received "+str(obj)+" was expecting json dict or file path string")
        except:
            raise ConstructorValueIncorrect("Received "+str(obj)+" was expecting json dict or file path string")

    def get_value(self , *keys):
        
        try:
            x = self._obj
            for key in keys:
                x = x[key]
            return x
        except:
            raise PathDoesntExistInJSONError(str(keys)+' not in json')



    def delete_value(self , *keys):
        try:
            x = self._obj
            keys = list(keys)
            for i in range(len(keys)-1):
                x = x[keys[i]]
            del x[keys[len(keys)-1]]
        except:
            raise PathDoesntExistInJSONError(str(keys)+' not in json')

    def set_value(self, value, *keys):
        try:
            x = self._obj
            keys = list(keys)
            for i in range(len(keys)-1):
                if keys[i] in x:
                    x = x[keys[i]]
                else:
                    x[keys[i]] = []
                    x = x[keys[i]]
            x[keys[len(keys)-1]] = value
        except:
            raise PathDoesntExistInJSONError(str(keys)+' not in json')



    def deep_match(self, js1, js2):
        lines1 = list(self.get_all_paths(js1, ""))
        lines2 = list(self.get_all_paths(js2, ""))
        diff = []
        for line in lines1:
            if line not in lines2:
                diff.append("+ "+line)
        for line in lines2:
            if line not in lines1:
                diff.append("- "+line)


        return diff


    def get_all_paths(self, data, path):
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, dict):
                    yield path+"->"+k
                    if path != "":
                        yield from self.get_all_paths(v, path+"->"+k)
                    else:
                        yield from self.get_all_paths(v, k)
                elif isinstance(v, list):
                    yield path+"->"+k
                    if path != "":
                        yield from self.get_all_paths(v, path+"->"+k)
                    else:
                        yield from self.get_all_paths(v, k)
                else:
                    yield path+"->"+k+"->"+str(v)

        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    yield from self.get_all_paths(item, path)
                elif isinstance(item, list):
                    yield from self.get_all_paths(item, path)
                else:
                    yield path+"->"+str(item)

    def copy(self, obj):
        return deepcopy(obj)



    def get_all_keys(self, data):
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, dict):
                    yield k
                    yield from self.get_all_keys(v)
                elif isinstance(v, list):
                    yield k
                    yield from self.get_all_keys(v)
                else:
                    yield k

        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    yield from self.get_all_keys(item)
                elif isinstance(item, list):
                    yield from self.get_all_keys(item)

class PathDoesntExistInJSONError(Exception):
    """Raised when a path doesnt exist in json"""
    pass

class ConstructorValueIncorrect(Exception):
    """Raised when dict or string isnt passed to constructor"""
    pass
                

    
