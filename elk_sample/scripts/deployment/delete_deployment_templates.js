// =============================================================================
// 
// Purpose: Delete a deployment template and all is associated instances configurations
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install fs
//  $ npm install dotenv
//
// This program does the following:
// 1. Deletes the deployment template as specified in the deployment-template file (passed as second command line argument) if it exists.
// 2. Deletes the instance configurations associated with a deployment template
// 
// Run script
//     $ node delete_deployment_templates.js <deployment-template-filename> <instance-configuration-filename> <environment>
//       environment:
//          prd for production environment
//           np for non-production environment
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

if (process.env.ELASTIC_ENV_PATH == null) {
	console.log("needs an environment variable to read .env file. You can set up this variable 'ELASTIC_ENV_PATH' two ways:")
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node delete-deployment_templates.js <deployment-template-name> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node delete-deployment_templates.js <deployment-template-name> <environment> ")
    process.exit(1)
}

if (process.argv.length != 4) {
	console.log("usage: node delete-config-deploy.js <deployment-template-name> <environment>")
    process.exit(2)
}

var myArgs = process.argv.slice(2);
var environ = myArgs[1]
let elastic_username, elastic_password, env_url

if (environ == 'prd') {
    elastic_username = process.env.ES_PRD_USERNAME;
    elastic_password = process.env.ES_PRD_PASSWORD;
    env_url = process.env.ES_PRD_ENV_URL;
} else if (environ == 'np'){
    elastic_username = process.env.ES_NP_USERNAME;
    elastic_password = process.env.ES_NP_PASSWORD;
    env_url = process.env.ES_NP_ENV_URL;
} else if (environ == 'sbx'){
    elastic_username = process.env.ES_SBX_USERNAME;
    elastic_password = process.env.ES_SBX_PASSWORD;
	env_url = process.env.ES_SBX_ENV_URL;
} else {
    console.log('invalid environment given please enter prd, np or sbx')
    process.exit(3)
}

deployment_template_name = myArgs[0]

var list_deployment_templates_url = env_url + '/api/v1/platform/configuration/templates/deployments'
var response_body_obj = invoke_ece("GET", list_deployment_templates_url, null)

var found = false

for (i = 0; i < response_body_obj.length; i++) {
	if (response_body_obj[i].name == deployment_template_name) {
		// save the deployment id
		var deployment_template_id = response_body_obj[i].id
		console.log(deployment_template_id)

		// get the deployment template as it contains a list of the instance configurations to refers to
		var get_deployment_template_url = env_url + '/api/v1/platform/configuration/templates/deployments/' + deployment_template_id + '?show_instance_configurations=true'
		template_response_body_obj = invoke_ece("GET", get_deployment_template_url, null)
		
		// delete the deployment template
		var delete_deployments_url = env_url + '/api/v1/platform/configuration/templates/deployments/' + deployment_template_id
		response_body_obj = invoke_ece("DELETE", delete_deployments_url, null)
		console.log(response_body_obj) 

		// delete the instance configurations
		for (j = 0; j < template_response_body_obj.instance_configurations.length; j++) {
			var delete_instance_config_url = env_url + '/api/v1/platform/configuration/instances/' + template_response_body_obj.instance_configurations[j].id
			instance_config_response_body_obj = invoke_ece("DELETE", delete_instance_config_url, null)
			console.log(instance_config_response_body_obj) 
		}

		found = true
		break
	}
}

if (found == false) {
	console.log("deployment template [" + deployment_template_name + "] not found....exiting")
	process.exit(99)
}

//----------------------------------------------------------------------------
// Call the Elasticsearch API that is pass to the method. The body of the API is 
// passed as a JSON object or a null object is passed.
// -----------------------------------------------------------------------------
function invoke_ece(command, api_url, json_obj) {
    auth = "Basic " + new Buffer.from(elastic_username + ":" + elastic_password).toString("base64");

	if (json_obj != null) {
		var response = request(command, api_url, {
			json: json_obj,
			headers: {
				"content-type": "application/json",
				"kbn-xsrf": true,
				"Authorization": auth
			}
		});
	} else {
		var response = request(command, api_url, {
			headers: {
				"content-type": "application/json",
				"kbn-xsrf": true,
				"Authorization": auth
			}
		});
	}

	try {
		var body = response.getBody('utf8');
	} catch(err) {
		if (err.statusCode == 404) {
			console.log('not found')
			return err
		}
		
		console.log(err)
		process.exit(400)
	}

	try {
		var body_obj = JSON.parse(body)
	} catch(err) {
		console.log(err)
		process.exit(401)
	}

	return(body_obj)
}
