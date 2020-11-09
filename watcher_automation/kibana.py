import requests

#Base Class for Kibana API
#
#
#
class Kibana():

    def __init__(self):
        pass

    def space_exists(self, space, session, kibana_url="http://kibana-ingress.elasticsearch.svc.cluster.local:80"):
        response = session.get(kibana_url+'/api/spaces/space/'+space)
        return response.status_code == 200
