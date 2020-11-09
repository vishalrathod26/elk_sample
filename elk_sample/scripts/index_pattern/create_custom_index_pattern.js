// =============================================================================
// 
// Author: Brett Bhate (slower)
// Purpose: Create Custom Index Pattern
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install dotenv
//
// Run script
//     $ node create_custom_index_pattern.js <environment>
//       environment:
//          prd for production environment
//          np for non-production environment
//          sbx for sandbox environment
// 
//       ELASTIC_ENV_PATH:
//          The location of .env file   
//
// Create a file called .env in directory pointed to by the environment variable ELASTIC_ENV_PATH
//
// ES_PRD_USERNAME=xxxx
// ES_PRD_PASSWORD=xxxx
// ES_PRD_ENV_URL=xxxx
// KB_PRD_USERNAME=xxxx
// KB_PRD_PASSWORD=xxxx
// KB_PRD_ENV_URL=xxxx
// 
// ES_NP_USERNAME=xxxx
// ES_NP_PASSWORD=xxxx
// ES_NP_ENV_URL=xxxx
// KB_NP_USERNAME=xxxx
// KB_NP_PASSWORD=xxxx
// KB_NP_ENV_URL=xxxx
// 
// ES_SBX_USERNAME=xxxx
// ES_SBX_PASSWORD=xxxx
// ES_SBX_ENV_URL=xxxx
// KB_SBX_USERNAME=xxxx
// KB_SBX_PASSWORD=xxxx
// KB_SBX_ENV_URL=xxxx
//
// =============================================================================
const creds = require('dotenv').config({path:process.env.ELASTIC_ENV_PATH})
var request = require('sync-request');
var fs = require('fs');
const { type } = require('os');

if (process.argv.length != 3) {
    console.log("usage: node create_custom_index_pattern.js <environment>")
    process.exit(1)
}

var myArgs = process.argv.slice(2);
var environ = myArgs[0]
let elastic_username, elastic_password, env_url

if (environ == 'prd') {
    elastic_username = process.env.KB_PRD_USERNAME;
    elastic_password = process.env.KB_PRD_PASSWORD;
    env_url = process.env.KB_PRD_ENV_URL;
} else if (environ == 'np'){
    elastic_username = process.env.KB_NP_USERNAME;
    elastic_password = process.env.KB_NP_PASSWORD;
    env_url = process.env.KB_NP_ENV_URL;
} else if (environ == 'sbx'){
    elastic_username = process.env.KB_SBX_USERNAME;
    elastic_password = process.env.KB_SBX_PASSWORD;
    env_url = process.env.KB_SBX_ENV_URL;
} else {
    console.log('invalid environment given please enter prd, np or sbx')
    process.exit(2)
}
 

// --------------------------------------------------------------
// A dictionary is defined to create custom index patterns
// index pattern as key and space name as value
// --------------------------------------------------------------
var custom_ip_dict = {
    "logs-gcp-gsuite-*": "gcp_network",
    "logs-gcp-vpcflow-*": "gcp_network",
    "logs-gcp-firewall-*": "gcp_network",
    "logs-pcf_admin-*": "pcf_admin",
    "metrics-pcf_admin-*": "pcf_admin",
    "logs-gcp-audit-activity-*": "gcp_audit",
    "logs-gcp-audit-policy-*": "gcp_audit",
    "logs-gcp-audit-system_event-*": "gcp_audit",
    "logs-gcp-audit-data_access-*": "gcp_audit"
};

for (var key in custom_ip_dict) {
	var value = custom_ip_dict[key];

	var json_obj = {
		"attributes": {
			"title": key
		}
	}

	// Define the base URL used in the Elasticsearch API calls
	var api_url = env_url + '/s/' + value + '/api/saved_objects/index-pattern/'+ key

	// console.log(api_url)
	api_call_custom_index_pattern(api_url, json_obj)
}

// -----------------------------------------------------------------------------
// Call the Elasticsearch API that is passed to the method. The body of the API is 
// passed as a JSON object.
// -----------------------------------------------------------------------------
function api_call_custom_index_pattern(api_url, json_obj) {
    auth = "Basic " + new Buffer.from(elastic_username + ":" + elastic_password).toString("base64");

    var response = request('POST', api_url, {
        json: json_obj,
        headers: {
            "content-type": "application/json",
            "kbn-xsrf": true,
            "Authorization": auth
        }
    });

    try {
		var body = response.getBody('utf8');
		if(response.statusCode = 200){
			console.log (key + ' index pattern created successfully')
		}
    } catch(err) {
		// console.log(err)
		if (err.statusCode == 409) {
			console.log (key + ' index pattern already created')
			return
		}	
		// process.exit(5)
    }

    try {
        var body_obj = JSON.parse(body)
    } catch(err) {
        console.log(err)
        process.exit(6)
    }
}
