// =============================================================================
// 
// Author: Brett Bhate (slower)
// Purpose: Create ILM policies
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install dotenv
//
// This program is driven by an external file. The format of the file is described
// below. The filename is passed to the program as a command line argument.
//
// Run script
//     $ node create_ilm_policy.js <policy-list-filename> <environment>
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
const request = require('sync-request');
const fs = require('fs');

if (process.env.ELASTIC_ENV_PATH == null) {
	console.log("needs an environment variable to read .env file. You can set up this variable 'ELASTIC_ENV_PATH' two ways:")
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node create_ilm_policy.js <policy-list-filename> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node create_ilm_policy.js <policy-list-filename> <environment> ")
    process.exit(1)
}

if (process.argv.length != 4) {
	console.log("usage: node create_ilm_policy.js <policy-list-filename> <environment>")
    process.exit(2)
}

const myArgs = process.argv.slice(2);
const environ = myArgs[1]

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
const base_ilm_api_url = env_url + '/_ilm/policy'
let text_file

// -----------------------------------------------------------------------------
// Read the file that contains a list of ILM policy filenames
// -----------------------------------------------------------------------------
try {
	text_file = fs.readFileSync(myArgs[0], 'utf8')
} catch (err) {
	console.log(err)
	process.exit(4)
}

// split and get the rows in an array
const rows = text_file.split('\n');

// move line by line
// ignore the first row/line of the file as it is the header
for (let i = 1; i < rows.length; i++) {
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

	create_ilm_policy(rows[i])
}

function create_ilm_policy(row) {
	let ilm_policy_file
	try {
		ilm_policy_file = fs.readFileSync(row, 'utf8')
	} catch (err) {
		console.log(err)
		process.exit(5)
	}

	try {
		ilm_policy_obj = JSON.parse(ilm_policy_file)
	} catch(err) {
		console.log(err)
		process.exit(6)
	}

	ilm_policy_name = row.split('.').slice(0, -1).join('.')
	console.log(ilm_policy_name)

	api_url = base_ilm_api_url + '/' + ilm_policy_name
	console.log(`api_url before calling update_elastic: ${api_url}`)

	update_elastic(api_url, ilm_policy_obj, elastic_username, elastic_password)
}

// -----------------------------------------------------------------------------
// Call the Elasticsearch API that is passed to the method. The body of the API is 
// passed as a JSON object.
// -----------------------------------------------------------------------------
function update_elastic(api_url, json_obj, elastic_username, elastic_password) {
    auth = "Basic " + new Buffer.from(elastic_username + ":" + elastic_password).toString("base64");
    console.log (`the api_url in update_elastic ${api_url}`)
	const response = request('PUT', api_url, {
		json: json_obj,
		headers: {
			"content-type": "application/json",
			"kbn-xsrf": true,
			"Authorization": auth
		}
	});
	let body, body_obj
	try {
		body = response.getBody('utf8');
	} catch(err) {
		console.log(err)
		process.exit(7)
	}

	try {
		body_obj = JSON.parse(body)
	} catch(err) {
		console.log(err)
		process.exit(8)
	}

	console.log(body_obj)
}
