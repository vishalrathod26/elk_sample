// =============================================================================
// 
// Author: Brett Bhate (slower)
// Purpose: Set index patterns for metrics and logs apps
//
// Note that the id field translates to the URL Identifier
//
// API Fields not specified:
//  "initials": "",
//
// Node requirements:
//  $ npm install sync-request
//  $ npm install dotenv
//
// This program is driven by an external file. The format of the file is described
// below. The filename is passed to the program as a command line argument.
//
// Run script
//     $ ELASTIC_ENV_PATH=/etc/home/.env node set-ip-alias.js <org-space-filename> <environment>
//       environment:
//          prd for production environment
//           np for non-production environment
//          sbx for sandbox environment
// 
// Create a file called .env in this directory as follows:
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

if (process.argv.length != 4) {
	console.log("usage: ELASTIC_ENV_PATH=<path to .env file> node set-ip-alias.js <org-space-filename> <environment>")
    process.exit(1)
}

const myArgs = process.argv.slice(2);
const environ = myArgs[1]
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
// Read the file that contains a list of orgs and spaces. Then iterate through
// the file line by line.
// -----------------------------------------------------------------------------
try {
    // read the entire file, its small enough 
    var csv = fs.readFileSync(myArgs[0], 'utf8')
} catch (err) {
    console.log(err)
    process.exit(3)
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
    // create_object function creates a saved objects of type infrastructure-ui-source with id=default in each space
    create_object(rows[i])
    // set_ipalias function sets required index patterns as default for metrics and logs applications with id=<default> for each space
    set_ipalias(rows[i])
}

function create_object(row) {
    // split by separator (,) and get the columns
    cols = row.split(',');
    if (cols[cf] == 'default'){
        // json body for post call
        var logtitle = 'logs-*'
        var log_json_obj = {
            "attributes": {
            "logAlias": logtitle
            }
        }
    // ---------------------------------------------------------------------------------------------
    // Define the base URL used in the Elasticsearch API calls, with query parameter overwrite=true
    // ---------------------------------------------------------------------------------------------
    var log_api_url = env_url + '/api/saved_objects/infrastructure-ui-source/default?overwrite=true'
    console.log(log_api_url)
    }
    else {
        // json body for post call
        var logtitle = 'logs' + '-' + cols[co] + '-*'
        var log_json_obj = {
            "attributes": {
            "logAlias": logtitle
            }
        }
    // ---------------------------------------------------------------------------------------------
    // Define the base URL used in the Elasticsearch API calls, with query parameter overwrite=true
    // ---------------------------------------------------------------------------------------------
    var log_api_url = env_url + '/s/' + cols[co] + '/api/saved_objects/infrastructure-ui-source/default?overwrite=true'
    console.log(log_api_url)
    }    
    apicall_createobject(log_api_url, log_json_obj)
}
// -----------------------------------------------------------------------------
// Call the Elasticsearch API that is passed to the method. The body of the API is 
// passed as a JSON object.
// -----------------------------------------------------------------------------
function apicall_createobject(api_url, json_obj) {
    auth = "Basic " + new Buffer.from(elastic_username + ":" + elastic_password).toString("base64");
    console.log('creating object for:'+ cols[co])
    var response = request('POST', api_url, {
        json: json_obj,
        headers: {
            "content-type": "application/json",
            "kbn-xsrf": true,
            "Authorization": auth
        }
    });  
    if (response.statusCode == 200){
        console.log('Successfully created object for space: ' + cols[co])
    }

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

// create 2 json bodies for metrics and logs apps and url for API call
function set_ipalias(row) {
// split by separator (,) and get the columns
cols = row.split(',');
    if (cols[cf] == 'default'){
    // json body for metrics
    var metrictitle = 'metrics-*'
    var metric_json_obj = {
        "attributes": {
        "metricAlias": metrictitle
        }
    }
    // json body for logs
    var logtitle = 'logs-*'
    var log_json_obj = {
        "attributes": {
        "logAlias": logtitle
        }
    }
    var metric_api_url = env_url + '/api/saved_objects/infrastructure-ui-source/default'
    var log_api_url = env_url + '/api/saved_objects/infrastructure-ui-source/default'

    apicall_indexpattern(metric_api_url, metric_json_obj)
    apicall_indexpattern(log_api_url, log_json_obj)
    }
    else {
    // json body for metrics
    var metrictitle = 'metrics' + '-' + cols[co] + '-*'
    var metric_json_obj = {
        "attributes": {
        "metricAlias": metrictitle
        }
    }
    // json body for logs
    var logtitle = 'logs' + '-' + cols[co] + '-*'
    var log_json_obj = {
        "attributes": {
        "logAlias": logtitle
        }
    }
    var metric_api_url = env_url + '/s/' + cols[co] + '/api/saved_objects/infrastructure-ui-source/default'
    var log_api_url = env_url + '/s/' + cols[co] + '/api/saved_objects/infrastructure-ui-source/default'

    apicall_indexpattern(metric_api_url, metric_json_obj)
    apicall_indexpattern(log_api_url, log_json_obj)
    }

}

// -----------------------------------------------------------------------------
// Call the Elasticsearch API that is passed to the method. The body of the API is 
// passed as a JSON object.
// -----------------------------------------------------------------------------
function apicall_indexpattern(api_url, json_obj) {
    auth = "Basic " + new Buffer.from(elastic_username + ":" + elastic_password).toString("base64");
    console.log('setting alias for space: ' + cols[co])

    var response = request('PUT', api_url, {
        json: json_obj,
        headers: {
            "content-type": "application/json",
            "kbn-xsrf": true,
            "Authorization": auth
        }
    });  
    if (response.statusCode == 200){
        console.log('Successfully set index pattern for space: ' + cols[co])
    }

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