// =============================================================================
//
// Author: Brett Bhate (slower)
// Purpose: Create custom roles and role mappings
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install dotenv
//  $ npm install path
//
// This program is driven by an external file. The format of the file is described
// below. The filename is passed to the program as a command line argument.
// See org-space below.
//
// Run script
//     $ node create_rbac_custom.js <rbac-custom.csv> <environment>
//		 environment:
//			prd for production environment
//			 np for non-production environment
//			sbx for sandbox environment
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
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node create_rbac_custom.js <rbac-custom-filename> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node create_rbac_custom.js <rbac-custom-filename> <environment> ")
    process.exit(1)
}

if (process.argv.length != 4) {
	console.log("usage: node create_rbac_custom.js <rbac-custom-filename> <environment>")
    process.exit(2)
}

var myArgs = process.argv.slice(2);
let environ = myArgs[1]
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
// rbac-custom file is a csv file with the following columns:
//   column 1: friendly Kibana space name
//   column 2: Kibana space name 
//   column 3: role name
//   column 4: role mapping
//
// zero base indicies are:
//  cf - is the Kibana friendly space name
//	co - is the organization
//  cs - role name
//  ct - role mapping
// -----------------------------------------------------------------------------
var cf = 0
var co = 1
var cs = 2
var ct = 3

// -----------------------------------------------------------------------------
// Read the file that contains a list of custom roles and role mappings
// -----------------------------------------------------------------------------
try {
	var csv = fs.readFileSync(myArgs[0], 'utf8')
} catch (err) {
	console.log(err)
	process.exit(4)
}

// split and get the rows in an array
var rows = csv.split('\n');

// move line by line
// ignore the first row/line of the file as it is the header
for (var i = 1; i < rows.length; i++) {
	// handle comments
	if (rows[i].startsWith('#')) {
		// console.log('skipping...' + rows[i])
		continue
	}

	// check for empty row
	if (rows[i].length < 3) {
		//console.log('skipping...blank line')
		continue
	}

	get_role(rows[i])
}

function get_role(row) {
	// split by separator (,) and get the columns
	cols = row.split(',');

	role_name = cols[cs]
	rolemapping_name = cols[ct]

	role_json = require('./' + role_name + '.json')
	let role_api_url = env_url + '/_security/role/' + role_name
	console.log(role_api_url)
	update_elastic(role_api_url, role_json)

	let rolemapping_api_url = env_url + '/_security/role_mapping/' + rolemapping_name
	rolemapping_json = require('./' + rolemapping_name + '.json')
	console.log(rolemapping_api_url)
	update_elastic(rolemapping_api_url, rolemapping_json)
}

// -------------------------------------------------------------------------------
// Call the Elasticsearch API that is passed to the method. The body of the API is
// passed as a JSON object.
// -------------------------------------------------------------------------------
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
		process.exit(5)
	}

	try {
		var body_obj = JSON.parse(body)
	} catch(err) {
		console.log(err)
		process.exit(6)
	}

	console.log(body_obj)
}
