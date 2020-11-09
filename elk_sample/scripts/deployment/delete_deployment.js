// =============================================================================
// 
// Purpose: Delete a deployment
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install fs
//  $ npm install dotenv
//
// This program does the following:
// 1. Deletes the deployment whose name is passed as a command line argument (passed as the first command line argumment) if it exists.
// 
// Run script
//     $ node delete_deployment.js <deployment-name> <environment>
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
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node delete-deployment.js <deployment-name> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node delete-deployment.js <deployment-name> <environment> ")
    process.exit(1)
}

if (process.argv.length != 4) {
	console.log("usage: node delete-deployment.js <deployment-name> <environment>")
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

// -----------------------------------------------------------------------------
// List out the deployments to get the deployment id of the named deployment.
// Once you have the deployment id then delete the deployment.
// The named deployment is passed as a command line argument.
// -----------------------------------------------------------------------------
var list_deployments_url = env_url + '/api/v1/deployments'
var list_response_body_obj = invoke_ece("GET", list_deployments_url, null)
var deleted = false

for (i = 0; i < list_response_body_obj.deployments.length; i++) {
	if (deleted == true) {
		break
	}

	if (list_response_body_obj.deployments[i].name == myArgs[0]) {
		// save the deployment id
		var deployment_id = list_response_body_obj.deployments[i].id

		// shutdown (terminate) the deployment. this sheds all of its resources and is necessary before a delete
		var shutdown_deployments_url = env_url + '/api/v1/deployments/' + deployment_id + '/_shutdown'
		shutdown_response_body_obj = invoke_ece("POST", shutdown_deployments_url, null)
		console.log(shutdown_response_body_obj) 

		while (true) {
			// query if deployment is actually shutdown before attempting to delete it (else the delete may fail)
			var query_deployments_url = env_url + '/api/v1/deployments/' + deployment_id
			query_response_body_obj = invoke_ece("GET", query_deployments_url, null)

			if (query_response_body_obj.hasOwnProperty("errors")) {
				console.log("deployment no longer exists")
				break
			}
			
			console.log(query_response_body_obj.resources.elasticsearch[0].info.status)

			if (query_response_body_obj.resources.elasticsearch[0].info.status == 'stopped') {
				break
			}

			for (i=0; i < 999999999; i++) {
				// this is a hack because there is no native sleep is JS.
			}
		}

		// delete the deployment
		var delete_deployments_url = env_url + '/api/v1/deployments/' + deployment_id
		delete_response_body_obj = invoke_ece("DELETE", delete_deployments_url, null)
		console.log(delete_response_body_obj) 
		deleted = true
	}
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

