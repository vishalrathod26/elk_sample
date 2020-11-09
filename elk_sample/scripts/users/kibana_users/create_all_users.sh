#!/bin/bash
# ------------------------------------------------------------------------
#
# Author: Brett Bhate (slower)
# Purpose: Create all the users required in the specified cluster
#
# Usage: create_all_users <environment> <cluster>
#       environment:
#         prd for production environment
#          np for non-production environment
#         sbx for sandbox environment
#
#		cluster:
#			main for the main observability cluster
#			monitor for the monitoring cluster
#
# NOTE:
#  1. The .env file MUST be setup to point to the correct cluster.
#  2. Please see create_user.js for a desription of the environment file.
#
# ------------------------------------------------------------------------
if [ $# != 2 ]; then
	echo "usage: create_all_users <environment> <cluster>"
	exit 1
fi

if [ "$1" != "prd" ] && [ "$1" != "np" ] && [ "$1" != "sbx" ]; then
	echo "envirnment must be one of prd, np or sbx"
	exit 2
fi

if [ "$2" == "main" ]; then
	node create_user.js clgx_service $1
	node create_user.js kibana_admin $1
	node create_user.js logstash_admin $1
	node create_user.js observability_writer $1
	node create_user.js metadata_user $1
	node create_user.js watcher_admin $1
elif [ "$2" == "monitor" ]; then
	node create_user.js clgx_service $1
	node create_user.js monitoring_writer $1
	node create_user.js watcher_admin $1
else
	echo "cluster must be one of main or monitor"
	exit 3
fi

