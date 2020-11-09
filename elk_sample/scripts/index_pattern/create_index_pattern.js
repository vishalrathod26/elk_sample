// =============================================================================
// 
// Author: Brett Bhate (slower)
// Purpose: Create Index Pattern
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install dotenv
//
// This program is driven by an external file. The format of the file is described
// below. The filename is passed to the program as a command line argument.
//
// Run script
//     $ node create_index_pattern.js <org-space-filename> <environment>
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
// To get detailed error message uncomment line number 179 and 244:
// // console.log(err) -> console.log(err)
// =============================================================================
const creds = require('dotenv').config({path:process.env.ELASTIC_ENV_PATH})
var request = require('sync-request');
var fs = require('fs');
const { type } = require('os');

if (process.env.ELASTIC_ENV_PATH == null) {
	console.log("needs an environment variable to read .env file. You can set up this variable 'ELASTIC_ENV_PATH' two ways:")
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node create_index_pattern.js <org-space-filename> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node create_index_pattern.js <org-space-filename> <environment> ")
    process.exit(1)
}

if (process.argv.length != 4) {
    console.log("usage: node create_index_pattern.js <org-space-filename> <environment>")
    process.exit(2)
}

var myArgs = process.argv.slice(2);
var environ = myArgs[1]
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
    process.exit(3)
}

// -----------------------------------------------------------------------
// There are 6 types of index pattern in each space
// metrics, uptime, logs, winlogs, analytics, apm
// -----------------------------------------------------------------------
var types = ["metrics", "uptime", "logs", "winlogs", "analytics", "apm"]

// -----------------------------------------------------------------------------
// kibana-space file is a csv file with the following columns:
//   column 1: friendly Kibana space name
//   column 2: organization (BU) name
//   column 3: pcf/gcp space
//
// zero base indicies are:
//  cf - is the Kibana friendly space name
//  co - is the organization
// -----------------------------------------------------------------------------
const cf = 0
const co = 1

// track if index pattern is already created
let dups = {}

// -----------------------------------------------------------------------------
// Read the file that contains a list of orgs and spaces. Then iterate through
// the file line by line.
// -----------------------------------------------------------------------------
try {
    // read the entire file, its small enough 
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
        //console.log('skipping...' + rows[i])
        continue
    }

    // check for empty row
    if (rows[i].length < 3) {
        //console.log('skipping...blank line')
        continue
    }
    // common_index_pattern referes to read only index pattern: metrics-platform_services_glb-* to be included in all the spaces
    create_index_pattern(rows[i])
	create_common_index_pattern(rows[i])
}

function create_index_pattern(row) {
	// split by separator (,) and get the columns
	cols = row.split(',');

	for(var i=0; i<types.length; i++) {
		var title = types[i] + '-' + cols[co] + '-*'
		var json_obj = {
			"attributes": {
				"title": title
			}
		}

		// Define the base URL used in the Elasticsearch API calls
		var api_url = env_url + '/s/' + cols[co] + '/api/saved_objects/index-pattern/'+ title
		console.log(api_url)

		api_call_index_pattern(api_url, json_obj, title)
	}
}

// -----------------------------------------------------------------------------
// Call the Elasticsearch API that is passed to the method. The body of the API is 
// passed as a JSON object.
// -----------------------------------------------------------------------------
function api_call_index_pattern(api_url, json_obj, title) {
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
			console.log (title + ' Index pattern created successfully in space: ' + cols[co])
		}
    } catch(err) {
		// console.log(err)
		if (err.statusCode == 409) {
			console.log(title + ' Index pattern aleady created in space: ' + cols[co])
			return
		}	
		// process.exit(5)
    }

    try {
        var body_obj = JSON.parse(body)
    } catch(err) {
        console.log(err)
        process.exit(8)
    }
}

// -----------------------------------------------------------------------------------
// One common index-pattern metrics-platform_services_glb-* needs to be created in all spaces
// -----------------------------------------------------------------------------------
function create_common_index_pattern(row) {
	// split by separator (,) and get the columns
	cols = row.split(',');

	if (cols[co] in dups) {
		console.log('skipping duplicate..', cols[co])
		return
	} else {
		dups[cols[co]] = cols[cf]
	}

	var json_obj = {
		"attributes": {
			"title": "metrics-platform_services_glb-*"
		}
	}

	// Define the base URL used in the Elasticsearch API calls
	var api_url = env_url + '/s/' + cols[co] + '/api/saved_objects/index-pattern/metrics-platform_services_glb-*'
	console.log(api_url)

	api_call_common_index_pattern(api_url, json_obj)
}

// -----------------------------------------------------------------------------
// Call the Elasticsearch API that is passed to the method. The body of the API is 
// passed as a JSON object.
// -----------------------------------------------------------------------------
function api_call_common_index_pattern(api_url, json_obj) {
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
			console.log ('metrics-platform_services_glb-* Index pattern created successfully in space: ' + cols[co])
		}
    } catch(err) {
		// console.log(err)
		if (err.statusCode == 409) {
			console.log('metrics-platform_services_glb-* already in space: ' + cols[co])
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