// =============================================================================
// 
// Author: Brett Bhate (slower)
// Purpose: Create roles and role mappings
//
// The are three roles that are defined to access Elasticsearch via
// Kibana. Each of these roles are associated with one or more AD Groups
//
// This program is driven by an external file. The format of the file is described
// below. The filename is passed to the program as a command line argument.
// See org-space below.
//
// Node requirements:
//	$ npm install sync-request
//	$ npm install dotenv
//
// Run script
//	 $ node create_rbac.js <org-space-filename> <environment>
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
	console.log("1. at the command prompt type: ELASTIC_ENV_PATH=<path to .env file> node create_rbac.js <org-space-filename> <environment>")
	console.log("2. set up a ELASTIC_ENV_PATH in .profile or .bash_profile or .zprofile based on your shell")
	console.log("open the .profile (based on your appropriate shell and do 'export ELASTIC_ENV_PATH='/path/to/env/file/.env'  ")
	console.log("In the 2 scenario, at the command prompt, just do:  node create_rbac.js <org-space-filename> <environment> ")
    process.exit(1)
}

if (process.argv.length != 4) {
	console.log("usage: node create_rbac.js <org-space-filename> <environment>")
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
// Define the base URL used in the Elasticsearch API calls
// -----------------------------------------------------------------------------
var base_role_api_url = env_url + '/_security/role/'
var base_role_mapping_api_url = env_url + '/_security/role_mapping/'

// -----------------------------------------------------------------------------
// Create query templates
// -----------------------------------------------------------------------------
var organization_watcher_index_query = "{\"bool\":{\"filter\":[{\"term\":{\"metadata.organization\":\"replace-organization\"}}]}}";
//var space_data_index_query = "{\"bool\":{\"filter\":[{\"term\":{\"labels.space\":\"replace-space\"}}]}}";
var space_watcher_index_query = "{\"bool\":{\"filter\":[{\"term\":{\"metadata.organization\":\"replace-organization\"}},{\"term\":{\"metadata.space\":\"replace-space\"}}]}}";

// -----------------------------------------------------------------------------
// Create entry template
// -----------------------------------------------------------------------------
var read_only_space_entry = "{ \
        \"application\" : \"kibana-.kibana\", \
        \"privileges\" : [ \
          \"space_read\" \
        ], \
        \"resources\" : [ \
        ] \
      }"

// -----------------------------------------------------------------------------
// org-space file is a csv file with the following columns:
//   column 1: friendly Kibana space name which is derived from the organization
//   column 2: organization (BU) name
//   column 3: pcf/gcp space
//
// zero base indicis are:
//	co - is the organization
//	cs - is the space column
// -----------------------------------------------------------------------------
var co = 1
var cs = 2

// -----------------------------------------------------------------------------
// Read the role mapping template from a file into a variable
// -----------------------------------------------------------------------------
try {
	var role_mapping_template = fs.readFileSync('role_mapping_template.json', 'utf8')
} catch (err) {
	console.log(err)
	process.exit(4)
}

// -----------------------------------------------------------------------------
// Read the organization user role template from a file into a variable
// -----------------------------------------------------------------------------
try {
	var user_role_template = fs.readFileSync('user_role_template.json', 'utf8')
} catch (err) {
	console.log(err)
	process.exit(5)
}

// -----------------------------------------------------------------------------
// Read the space user role mapping template from a file into a variable 
// -----------------------------------------------------------------------------
try {
	var admin_role_template = fs.readFileSync('admin_role_template.json', 'utf8')
} catch (err) {
	console.log(err)
	process.exit(6)
}

// Track duplicate organization user roles and ignore them. 
// i.e dont make multiple API call for the same organization role and role mapping.
var dups = new Map()

// -----------------------------------------------------------------------------
// Read the file that contains a list of orgs and spaces. Then iterate through
// the file line by line.
// -----------------------------------------------------------------------------
try {
	// read the entire file, its small enough 
	var csv = fs.readFileSync(myArgs[0], 'utf8')
} catch (err) {
	console.log(err)
	process.exit(8)
}

var org_space_array = new Array()

// split file by newline and get the rows in an array
var rows = csv.split('\n');

// move line by line
// ignore the first row/line of the file as it is the header
let idx = 0
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
	let cols = rows[i].split(',');

	// store the org and space value in 2-d array
	// index 1 = org, index 2 = space
	let os_array = new Array(2)
	os_array[0] = cols[1]
	os_array[1] = cols[2]
	org_space_array[idx] = os_array
	idx = idx + 1
}

for (let i = 0; i < org_space_array.length; i++) {
	// check if already seen this organization
	// if so then skip it
	if (dups.has(org_space_array[i][0])) {
		console.log('skipping duplicate...', org_space_array[i][0])
		process = false
	} else {
		process = true
		dups.set(org_space_array[i][0])
	}

	if (process) {
		// create the user role
		create_role(org_space_array[i][0], "user")

		// create the role mapping for the org level user
		create_role_mapping(org_space_array[i][0], org_space_array[i][0], "organization-user")

		// create the admin role
		create_role(org_space_array[i][0], "admin")
	}

	// create the role mapping for the space level user
	create_role_mapping(org_space_array[i][0], org_space_array[i][1], "space-user")

	// create the role mapping for the space level admin
	create_role_mapping(org_space_array[i][0], org_space_array[i][1], "space-admin")
}

// -----------------------------------------------------------------------------
// Create a role mapping for role.
// The AD groups assigned is dependent on the role
// -----------------------------------------------------------------------------
function create_role_mapping(os_org, os_space, role) {
	try {
		var role_mapping_obj = JSON.parse(role_mapping_template)
	} catch(err) {
		console.log(err)
		process.exit(9)
	}

	if (role == "organization-user") {
		role_mapping_obj.roles = os_org.toLowerCase() + "_user_role"

		api_url = base_role_mapping_api_url + os_org.toLowerCase() + "_" + "user_rolemapping"

		// CH 08-06-2020
		// Remove the PCF AD groups when the cut over to the new cop AD is complete
		auditors_pcf = "CN=PCF-GG-" + os_org + "-Auditors,OU=SecurityGroups,OU=EnterpriseGroups,OU=Corelogic,DC=infosolco,DC=net"

		auditors_cop = "CN=cop-gg-" + os_org + "-auditors,OU=GCP,OU=Domain Groups,OU=CLGX,DC=infosolco,DC=net"

		var field_text = '{"field" : {"groups" : [ "' + auditors_pcf + '","' + auditors_cop + '" ]}}'

		try {
			var field_obj = JSON.parse(field_text)
			role_mapping_obj.rules.all[1] = field_obj
		} catch(err) {
			console.log(err)
			process.exit(10)
		}
	} else if (role == "space-user") {
		role_mapping_obj.roles = os_org.toLowerCase() + "_user_role"

		api_url = base_role_mapping_api_url + os_org.toLowerCase() + "_" + os_space.toLowerCase() + "_" + "user_rolemapping"

		// CH 08-06-2020
		// Remove the PCF AD groups when the cut over to the new cop AD is complete
		managers_pcf = "CN=PCF-GG-" + os_org + "-" + os_space + "-Managers,OU=SecurityGroups,OU=EnterpriseGroups,OU=Corelogic,DC=infosolco,DC=net"
		quality_assurance_pcf = "CN=PCF-GG-" + os_org + "-" + os_space + "-QualityAssurance,OU=SecurityGroups,OU=EnterpriseGroups,OU=Corelogic,DC=infosolco,DC=net"
		data_analyst_pcf = "CN=PCF-GG-" + os_org + "-" + os_space + "-DataAnalysts,OU=SecurityGroups,OU=EnterpriseGroups,OU=Corelogic,DC=infosolco,DC=net"

		managers_cop = "CN=cop-gg-" + os_org + "-" + os_space + "-managers,OU=GCP,OU=Domain Groups,OU=CLGX,DC=infosolco,DC=net"
		quality_assurance_cop = "CN=cop-gg-" + os_org + "-" + os_space + "-qualityops,OU=GCP,OU=Domain Groups,OU=CLGX,DC=infosolco,DC=net"

		var field_text = '{"field" : {"groups" : [ "' + managers_pcf + '","' + quality_assurance_pcf + '","' + data_analyst_pcf + 
							'","' + managers_cop + '","' + quality_assurance_cop + '" ]}}'

		try {
			var field_obj = JSON.parse(field_text)
			role_mapping_obj.rules.all[1] = field_obj
		} catch(err) {
			console.log(err)
			process.exit(11)
		}
	} else if (role == "space-admin") {
		role_mapping_obj.roles = os_org.toLowerCase() + "_admin_role"

		api_url = base_role_mapping_api_url + os_org.toLowerCase() + "_" + os_space.toLowerCase() + "_" + "admin_rolemapping"

		// CH 08-06-2020
		// Remove the PCF AD groups when the cut over to the new cop AD is complete
		developers_pcf = "CN=PCF-GG-" + os_org + "-" + os_space + "-Developers,OU=SecurityGroups,OU=EnterpriseGroups,OU=Corelogic,DC=infosolco,DC=net"
		infra_operator_pcf = "CN=PCF-GG-" + os_org + "-" + os_space + "-InfraOperators,OU=SecurityGroups,OU=EnterpriseGroups,OU=Corelogic,DC=infosolco,DC=net"
		data_operator_pcf = "CN=PCF-GG-" + os_org + "-" + os_space + "-DataOperators,OU=SecurityGroups,OU=EnterpriseGroups,OU=Corelogic,DC=infosolco,DC=net"

		developers_cop = "CN=cop-gg-" + os_org + "-" + os_space + "-developers,OU=GCP,OU=Domain Groups,OU=CLGX,DC=infosolco,DC=net"
		infra_operator_cop = "CN=cop-gg-" + os_org + "-" + os_space + "-infraops,OU=GCP,OU=Domain Groups,OU=CLGX,DC=infosolco,DC=net"
		data_operator_cop = "CN=cop-gg-" + os_org + "-" + os_space + "-dataops,OU=GCP,OU=Domain Groups,OU=CLGX,DC=infosolco,DC=net"
		data_analyst_cop = "CN=cop-gg-" + os_org + "-" + os_space + "-datadevs,OU=GCP,OU=Domain Groups,OU=CLGX,DC=infosolco,DC=net"

		var field_text = '{"field" : {"groups" : [ "' + developers_pcf + '","' + infra_operator_pcf + '","' + data_operator_pcf + 
							'","' + developers_cop + '","' + infra_operator_cop + '","' + data_operator_cop + '","' + data_analyst_cop + '" ]}}'

		try {
			var field_obj = JSON.parse(field_text)
			role_mapping_obj.rules.all[1] = field_obj
		} catch(err) {
			console.log(err)
			process.exit(12)
		}
	} else {
		console.log("invalid rolemapping role supplied [" + role + "]");
		process.exit(13)
	}

	console.log(api_url)

	update_elastic(api_url, role_mapping_obj)
}

// -----------------------------------------------------------------------------
// Create roles for the user and admin at the org level
// -----------------------------------------------------------------------------
function create_role(os_org, role) {
	if (role == "user") {
		try {
			role_obj = JSON.parse(user_role_template)
		} catch(err) {
			console.log(err)
			process.exit(15)
		}
	} else if (role == "admin") {
		try {
			role_obj = JSON.parse(admin_role_template)
		} catch(err) {
			console.log(err)
			process.exit(15)
		}

	} else {
		console.log("invalid role supplied [" + role + "]");
		process.exit(14)
	}

	try {
		var read_only_space_obj = JSON.parse(read_only_space_entry)
	} catch(err) {
		console.log(err)
		process.exit(15)
	}

	// fix the index names
	role_obj.indices[0].names = "metrics-*"
	role_obj.indices[1].names = "logs-*"
	role_obj.indices[2].names = "winlogs-*"
	role_obj.indices[3].names = "uptime-*"
	role_obj.indices[4].names = "apm-*"

	// index 5 is *platform_services_glb
	// all roles should have access to this index to allow users to view the logs of platform services

	// fix the watcher index query with the organization
	role_obj.indices[6].query = organization_watcher_index_query.replace("replace-organization", os_org)

	// fix the application space
	role_obj.applications[0].resources[0] = "space:" + os_org

	// add every space as a read-only space
	var j = 0
	var first_time = true
	let dup_read_space_map = {}
	for (let i = 0; i < org_space_array.length; i++) {
		if (org_space_array[i][0] == os_org) {
			// skip this as it is effectively the application[0] space
			continue
		}

		if (org_space_array[i][0] in dup_read_space_map) {
			continue
		} else {
			dup_read_space_map[org_space_array[i][0]] = org_space_array[i][1]
		}

		if (first_time == true) {
			role_obj.applications[1] = read_only_space_obj
			first_time = false
		}

		role_obj.applications[1].resources[j] = "space:" + org_space_array[i][0]
		j = j + 1
	}

	// build the url by adding the organization and role
	var api_url = base_role_api_url + os_org.toLowerCase() + "_" + role + "_role"

	console.log(api_url)

	update_elastic(api_url, role_obj)
}

// -----------------------------------------------------------------------------
// Call the Elasticsearch API that is passed to the method. The body of the API is 
// passed as a JSON object.
// -----------------------------------------------------------------------------
function update_elastic(api_url, json_obj) {
	// console.log(JSON.stringify(json_obj))
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
		process.exit(19)
	}

	try {
		var body_obj = JSON.parse(body)
	} catch(err) {
		console.log(err)
		process.exit(20)
	}

	console.log(body_obj)
}
