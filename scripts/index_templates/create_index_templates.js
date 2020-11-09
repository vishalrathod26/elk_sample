// =============================================================================
// 
// Author: Brett Bhate (slower)
// Purpose: Create an index template per kibana space
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install dotenv
//
// This program is driven by an external file. The format of the file is described
// below. The filename is passed to the program as a command line argument.
//
// Run script
//     $ node create_index_templates.js <index-template-filename> <org-space-filename> <environment>
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
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node create_index_templates.js <index-template-filename> <org-space-filename> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node create_index_templates.js <index-template-filename> <org-space-filename> <environment> ")
    process.exit(1)
}

if (process.argv.length != 5) {
	console.log("usage: node create_index_templates.js <index-template-filename> <org-space-filename> <environment>")
    process.exit(2)
}

var myArgs = process.argv.slice(2);
var environ = myArgs[2]
var index_template_name = myArgs[0]
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
// Define the base URL used in the Elasticsearch API calls
// -----------------------------------------------------------------------------
var base_index_template_api_url = env_url + '/_index_template'

// -----------------------------------------------------------------------------
// kibana-space file is a csv file with the following columns:
//   column 1: friendly Kibana space name
//   column 2: organization (BU) name
//   column 3: pcf/gcp space
//
// zero base indicies are:
//  cf - is the Kibana friendly space name
//	co - is the organization
// -----------------------------------------------------------------------------
var cf = 0
var co = 1

// -----------------------------------------------------------------------------
// Read the role index template from a file
// -----------------------------------------------------------------------------
try {
	var metrics_index_template = fs.readFileSync(index_template_name, 'utf8')
} catch (err) {
	console.log(err)
	process.exit(4)
}

// -----------------------------------------------------------------------------
// Read the file that contains a list of orgs and spaces. Then iterate through
// the file line by line.
// -----------------------------------------------------------------------------
try {
	var csv = fs.readFileSync(myArgs[1], 'utf8')
} catch (err) {
	console.log(err)
	process.exit(5)
}

// split and get the rows in an array
var rows = csv.split('\n');

// track if space already created
var dups = {}

// move line by line
// ignore the first row/line of the file as it is the header
for (var i = 1; i < rows.length; i++) {
	// handle comments
	if (rows[i].startsWith('#')) {
		//console.log('skipping...' + rows[i])
		continue
	}

	// check for empty row
	if (rows[i].length < 3) {
		//console.log('skipping...blank line')
		continue
	}

	create_metrics_index_template(rows[i])
}

function create_metrics_index_template(row) {
	// split by separator (,) and get the columns
	cols = row.split(',');

	if (cols[co] in dups) {
		console.log('skipping duplicate..', cols[co])
		return
	} else {
		dups[cols[co]] = cols[cf]
	}

	try {
		index_template_obj = JSON.parse(metrics_index_template)
	} catch(err) {
		console.log(err)
		process.exit(6)
	}

	index_template_obj.index_patterns[0] = 'metrics-' + cols[co] + '-*'
	index_template_obj.template.settings.index.lifecycle.rollover_alias = 'metrics-' + cols[co]

	if (environ == 'prd') {
		index_template_obj.template.settings.index.number_of_shards = 9
	} else if (environ == 'np') {
		index_template_obj.template.settings.index.number_of_shards = 6
	} else if (environ == 'sbx') {
		index_template_obj.template.settings.index.number_of_shards = 3
	} else {
		console.log('unsupported environment [' + environ + ']...exiting')	
		process.exit(7)
	}

	//console.log(JSON.stringify(index_template_obj))

	index_template_name = 'metrics-index-template-small-' + cols[co]
	api_url = base_index_template_api_url + "/" + index_template_name
	console.log(api_url)

	update_elastic(api_url, index_template_obj)
}

// -----------------------------------------------------------------------------
// Call the Elasticsearch API that is passed to the method. The body of the API is 
// passed as a JSON object.
// -----------------------------------------------------------------------------
function update_elastic(api_url, json_obj) {
    auth = "Basic " + new Buffer.from(elastic_username + ":" + elastic_password).toString("base64");

	var response = request('PUT', api_url, {
		json: json_obj,
		headers: {
			"content-type": "application/json",
			"kbn-xsrf": true,
			"Authorization": auth
		}
	});

	try {
		var body = response.getBody('utf8');
	} catch(err) {
		console.log(err)
		process.exit(8)
	}

	try {
		var body_obj = JSON.parse(body)
	} catch(err) {
		console.log(err)
		process.exit(9)
	}

	console.log(body_obj)
}
