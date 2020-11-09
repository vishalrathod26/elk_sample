// =============================================================================
// 
// Purpose: Create a deployment
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install fs
//  $ npm install dotenv
//
// This program does the following:
// 1. Create an elestic deployment
//
// Run script
//     $ node create_deployment.js <deployment-template-name> <deployment-filename> <environment>
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
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node create-deployment.js <deployment-template-name> <deployment-filename> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node create-deployment.js <deployment-template-name> <deployment-filename> <environment> ")
    process.exit(1)
}

if (process.argv.length != 5) {
	console.log("usage: node create-deployment.js <deployment-template-name> <deployment-filename> <environment>")
    process.exit(2)
}

var myArgs = process.argv.slice(2);
var environ = myArgs[2]
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
// Below is a map of instance configuration, instance type, node attribute 
// and node type. Use this map to figure out which instance configuration is 
// used in the deployment template
//
// ============================================================
// Instance Config   Instance Type   Node Attribute   Node Type
// ============================================================
// obs-master        elasticsearch   hot_metrics      master
// ------------------------------------------------------------
// obs-kibana        kibana          n/a              n/a
// ------------------------------------------------------------
// obs-coordinator   elasticsearch   n/a              ingest
// ------------------------------------------------------------
// obs-ml            elasticsearch   n/a              ml
// ------------------------------------------------------------
// obs-hot_metrics   elasticsearch   n/a              data
// ------------------------------------------------------------
// obs-warm_metrics  elasticsearch   n/a              data
// ------------------------------------------------------------
// obs-hot_logs      elasticsearch   n/a              data
// ------------------------------------------------------------
// obs-warm_logs     elasticsearch   n/a              data
// ------------------------------------------------------------
// obs-cold_logs     elasticsearch   n/a              data
// ------------------------------------------------------------
// obs-apm           apm             n/a              n/a
// ============================================================
//
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Get the deployment template on which this deployment will be based.
// Iterate thru the deployment and save the configuration instance ids in a 
// hashmap. These configuration instance ids will be used to populate the deploy.
// -----------------------------------------------------------------------------
var deployment_template_name = myArgs[0]
var list_deployment_templates_url = env_url + '/api/v1/platform/configuration/templates/deployments'
var response_body_obj = invoke_ece("GET", list_deployment_templates_url, null)

for (i = 0; i < response_body_obj.length; i++) {
	if (response_body_obj[i].name == deployment_template_name) {
		// save the deployment id
		var deployment_template_id = response_body_obj[i].id
		console.log(deployment_template_id)

		// get the deployment template as it contains a list of the instance configurations to refers to
		var get_deployment_template_url = env_url + '/api/v1/platform/configuration/templates/deployments/' + deployment_template_id + '?show_instance_configurations=true'
		deployment_template_obj = invoke_ece("GET", get_deployment_template_url, null)
		break
	}
}

deployment_template_map = {}

deployment_template_map['obs-apm'] = deployment_template_obj.cluster_template.apm.plan.cluster_topology[0].instance_configuration_id
deployment_template_map['obs-kibana'] = deployment_template_obj.cluster_template.kibana.plan.cluster_topology[0].instance_configuration_id

for (i = 0; i < deployment_template_obj.cluster_template.plan.cluster_topology.length; i++) {
	if (deployment_template_obj.cluster_template.plan.cluster_topology[i].elasticsearch.hasOwnProperty("node_attributes")) {
		switch (deployment_template_obj.cluster_template.plan.cluster_topology[i].elasticsearch.node_attributes.data) {
			case "hot_metrics":
				deployment_template_map['obs-hot-metrics'] = deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id
				break;

			case "warm_metrics":
				deployment_template_map['obs-warm-metrics'] =  deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id
				break;

			case "hot_logs":
				deployment_template_map['obs-hot-logs'] = deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id
				break;

			case "warm_logs":
				deployment_template_map['obs-warm-logs'] = deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id
				break;

			case "cold_logs":
				deployment_template_map['obs-cold-logs'] = deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id
				break;
		}
	} else {
		if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.hasOwnProperty("master")) {
			if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.master == true) {
				deployment_template_map['obs-master'] =  deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id
			}
		}

		if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.hasOwnProperty("ml")) {
			if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.ml == true) {
				deployment_template_map['obs-ml'] = deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id
			}
		}

		if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.hasOwnProperty("ingest")) {
			if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.ingest == true) {
				deployment_template_map['obs-coordinator'] = deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id
			}
		}
	} 
}

// -----------------------------------------------------------------------------
// Read in a deployment based on a deployment file
// -----------------------------------------------------------------------------
try {
	var deployment_file = fs.readFileSync(myArgs[1], 'utf8')
} catch (err) {
	console.log(err)
	process.exit(4)
}

try {
	deployment_obj = JSON.parse(deployment_file)
} catch (err) {
	console.log(err)
	process.exit(5)
}

// -----------------------------------------------------------------------------
// Create a final deployment from the file read and the hashmap of configuration
// instance ids
// -----------------------------------------------------------------------------
deployment_obj.resources.apm[0].plan.cluster_topology[0].instance_configuration_id = deployment_template_map['obs-apm']
deployment_obj.resources.kibana[0].plan.cluster_topology[0].instance_configuration_id = deployment_template_map['obs-kibana']

for (i = 0; i < deployment_obj.resources.elasticsearch[0].plan.cluster_topology.length; i++) {
	if (deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].elasticsearch.hasOwnProperty("node_attributes")) {
		switch (deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].elasticsearch.node_attributes.data) {
			case "hot_metrics":
				deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].instance_configuration_id = deployment_template_map['obs-hot-metrics']
				break;

			case "warm_metrics":
				deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].instance_configuration_id = deployment_template_map['obs-warm-metrics']
				break;

			case "hot_logs":
				deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].instance_configuration_id = deployment_template_map['obs-hot-logs']
				break;

			case "warm_logs":
				deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].instance_configuration_id = deployment_template_map['obs-warm-logs']
				break;

			case "cold_logs":
				deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].instance_configuration_id = deployment_template_map['obs-cold-logs']
				break;
		}
	} else {
		if (deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].node_type.hasOwnProperty("master")) {
			if (deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].node_type.master == true) {
				deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].instance_configuration_id = deployment_template_map['obs-master']
			}
		}

		if (deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].node_type.hasOwnProperty("ml")) {
			if (deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].node_type.ml == true) {
				deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].instance_configuration_id = deployment_template_map['obs-ml']
			}
		}

		if (deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].node_type.hasOwnProperty("ingest")) {
			if (deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].node_type.ingest == true) {
				deployment_obj.resources.elasticsearch[0].plan.cluster_topology[i].instance_configuration_id = deployment_template_map['obs-coordinator']
			}
		}
	} 
}

deployment_obj.resources.elasticsearch[0].plan.deployment_template.id = deployment_template_id

var create_deployment_url = env_url + '/api/v1/deployments'
response_body_obj = invoke_ece("POST", create_deployment_url, deployment_obj)
console.log(response_body_obj) 

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

