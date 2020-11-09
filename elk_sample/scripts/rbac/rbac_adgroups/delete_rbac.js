// =============================================================================
// 
// Author: Brett Bhate (slower)
// Purpose: Delete roles and role mappings
//
// Delete custom roles and role mappings.
//
// This program is driven by an external file. The format of the file is described
// below. The filename is passed to the program as a command line argument.
// See org-space below.
//
// Node requirements:
//	$ npm install sync-request
//  $ npm install dotenv
//
// Run script
//	 $ node delete_rbac.js <org-space-filename> <environment>
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
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node delete_rbac.js <org-space-filename> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node delete_rbac.js <org-space-filename> <environment> ")
    process.exit(1)
}

if (process.argv.length != 4) {
	console.log("usage: node delete_rbac.js <org-space-filename> <environment>")
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
// Define the base URL used in the Elasticsearch API calls
// -----------------------------------------------------------------------------
var base_role_api_url = env_url + '/_security/role/'
var base_role_mapping_api_url = env_url + '/_security/role_mapping/'

// -----------------------------------------------------------------------------
// org-space file is a csv file with the following columns:
//   column 1: friendly Kibana space name which is derived from the organization
//   column 2: organization (BU) name
//   column 3: pcf/gcp space
//
// zero base indices are:
//	co - is the organization
//	cs - is the space column
// -----------------------------------------------------------------------------
var co = 1
var cs = 2

// -----------------------------------------------------------------------------
// Read the file that contains a list of orgs and spaces. Then iterate through
// the file line by line.
// -----------------------------------------------------------------------------
try {
	var csv = fs.readFileSync(myArgs[0], 'utf8')
} catch (err) {
	console.log(err)
	process.exit(4)
}

// Track duplicate organization user roles and ignore them. 
// i.e dont make multiple API call for the same organization role and role mapping.
var dups = new Map()

// split and get the rows in an array
var rows = csv.split('\n');

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

	// split row by separator (,) and get the columns
	var cols = rows[i].split(',');

	// check if already seen this organization
	// if so then skip it
	if (dups.has(cols[1])) {
		console.log('skipping duplicate...', cols[1])
		process = false
	} else {
		process = true
		dups.set(cols[1])
	}

	if (process) {
		// delete the roles
		delete_role(cols, "user")
		delete_role(cols, "admin")
		delete_role_mapping(cols, "organization-user")
	}

	// delete the role mappings
	delete_role_mapping(cols, "space-user")
	delete_role_mapping(cols, "space-admin")
}

// -----------------------------------------------------------------------------
// Delete a role mapping for role.
// -----------------------------------------------------------------------------
function delete_role_mapping(cols, role) {
	if (role == "organization-user") {
		api_url = base_role_mapping_api_url + cols[co].toLowerCase() + "_" + "user_rolemapping"
	} else if (role == "space-user") {
		api_url = base_role_mapping_api_url + cols[co].toLowerCase() + "_" + cols[cs].toLowerCase() + "_" + "user_rolemapping"
	} else if (role == "space-admin") {
		api_url = base_role_mapping_api_url + cols[co].toLowerCase() + "_" + cols[cs].toLowerCase() + "_" + "admin_rolemapping"
	} else {
		console.log("invalid rolemapping role supplied [" + role + "]");
		process.exit(5)
	}

	console.log(api_url)

	update_elastic(api_url)
}

// -----------------------------------------------------------------------------
// Delete the organization level user role.
// -----------------------------------------------------------------------------
function delete_role(cols, role) {
	if (role != "user" & role != "admin") {
		console.log("invalid role supplied [" + role + "]");
		process.exit(6)
	}

	var api_url = base_role_api_url + cols[co].toLowerCase() + "_" + role + "_role"

	console.log(api_url)

	update_elastic(api_url)
}

// -----------------------------------------------------------------------------
// Call the Elasticsearch API that is pass to the method.
// -----------------------------------------------------------------------------
function update_elastic(api_url) {
	auth = "Basic " + new Buffer.from(elastic_username + ":" + elastic_password).toString("base64");

	var response = request('DELETE', api_url, {
		headers: {
			"content-type": "application/json",
			"kbn-xsrf": true,
			"Authorization": auth
		}
	});

	try {
		var body = response.getBody('utf8');
	} catch(err) {
		if (err.statusCode == 404) {
			console.log('not found')
			return
		}

		console.log(err)
		process.exit(7)
	}

	try {
		var body_obj = JSON.parse(body)
	} catch(err) {
		console.log(err)
		process.exit(8)
	}

	console.log(body_obj)
}
