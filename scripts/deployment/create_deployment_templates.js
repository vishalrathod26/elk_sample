// =============================================================================
// 
// Purpose: Create instance configurations and a deployment template
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install fs
//  $ npm install dotenv
//
// This program does the following:
// 1. Create the instance configurations specified in the instance configuration file (passed as the third command line argument).
// 2. Create the deployment template as specified in the deployment template file (passed as second command line argument). 
//
// Note that this script does NOT create a new deployment but should be improved to create it.
// 
// Run script
//     $ node create_deployment_templates.js <deployment-template-filename> <instance-configuration-filename> <environment>
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
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node create-deployment_templates.js <deployment-template-filename> <instance-configuration-filename> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node create-deployment_templates.js <deployment-template-filename> <instance-configuration-filename> <environment> ")
    process.exit(1)
}

if (process.argv.length != 5) {
	console.log("usage: node create-deployment_templates.js <deployment-template-filename> <instance-configuration-filename> <environment>")
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
// Create the instance configurations specified in the instance configuration 
// file.
// -----------------------------------------------------------------------------
try {
	var instance_config_file = fs.readFileSync(myArgs[1], 'utf8')
} catch (err) {
	console.log(err)
	process.exit(4)
}

var config_instance_map = {}

instance_config_obj = JSON.parse(instance_config_file)

for (i = 0; i < instance_config_obj.instance_configurations.length; i++) { 
	var create_instance_configuration_url = env_url + '/api/v1/platform/configuration/instances'
	response_body_obj = invoke_ece("POST", create_instance_configuration_url, instance_config_obj.instance_configurations[i])
	console.log(response_body_obj) 

	config_instance_map[instance_config_obj.instance_configurations[i].name] = response_body_obj.id
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
// Create the deployment template specified in the deployment template file
// This file was read and stored in the deployment template object
// The deployment template needs to refer to instance configurations. The 
// instance configuration names and ids are stored in a hash map - config instance map
// Run through the deployment template and update it with the correct instance 
// configuration ids.
// -----------------------------------------------------------------------------
try {
	var deployment_template_file = fs.readFileSync(myArgs[0], 'utf8')
} catch (err) {
	console.log(err)
	process.exit(5)
}

try {
	deployment_template_obj = JSON.parse(deployment_template_file)
} catch (err) {
	console.log(err)
	process.exit(6)
}

deployment_template_obj.cluster_template.apm.plan.cluster_topology[0].instance_configuration_id = config_instance_map['obs-apm']
deployment_template_obj.cluster_template.kibana.plan.cluster_topology[0].instance_configuration_id = config_instance_map['obs-kibana']

for (i = 0; i < deployment_template_obj.cluster_template.plan.cluster_topology.length; i++) {
	if (deployment_template_obj.cluster_template.plan.cluster_topology[i].elasticsearch.hasOwnProperty("node_attributes")) {
		switch (deployment_template_obj.cluster_template.plan.cluster_topology[i].elasticsearch.node_attributes.data) {
			case "hot_metrics":
				deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id = config_instance_map['obs-hot-metrics']
				break;

			case "warm_metrics":
				deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id = config_instance_map['obs-warm-metrics']
				break;

			case "hot_logs":
				deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id = config_instance_map['obs-hot-logs']
				break;

			case "warm_logs":
				deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id = config_instance_map['obs-warm-logs']
				break;

			case "cold_logs":
				deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id = config_instance_map['obs-cold-logs']
				break;
		}
	} else {
		if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.hasOwnProperty("master")) {
			if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.master == true) {
				deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id = config_instance_map['obs-master']
			}
		}

		if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.hasOwnProperty("ml")) {
			if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.ml == true) {
				deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id = config_instance_map['obs-ml']
			}
		}

		if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.hasOwnProperty("ingest")) {
			if (deployment_template_obj.cluster_template.plan.cluster_topology[i].node_type.ingest == true) {
				deployment_template_obj.cluster_template.plan.cluster_topology[i].instance_configuration_id = config_instance_map['obs-coordinator']
			}
		}
	} 
}

var create_deployment_template_url = env_url + '/api/v1/platform/configuration/templates/deployments'
response_body_obj = invoke_ece("POST", create_deployment_template_url, deployment_template_obj)
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

