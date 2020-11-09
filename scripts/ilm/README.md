Purpose: Create ILM policies

Node requirements:
 $ npm install sync-request
 $ npm install dotenv

This program is driven by an external file. The format of the file is described
below. The filename is passed to the program as a command line argument.

Run script
    $ node create_ilm_policy.js <policy-list-filename> <environment>
      environment:
         prd for production environment
         np for non-production environment
         sbx for sandbox environment

      ELASTIC_ENV_PATH:
         The location of .env file   

Create a file called .env in directory pointed to by the environment variable ELASTIC_ENV_PATH

ES_PRD_USERNAME=xxxx
ES_PRD_PASSWORD=xxxx
ES_PRD_ENV_URL=xxxx
KB_PRD_USERNAME=xxxx
KB_PRD_PASSWORD=xxxx
KB_PRD_ENV_URL=xxxx

ES_NP_USERNAME=xxxx
ES_NP_PASSWORD=xxxx
ES_NP_ENV_URL=xxxx
KB_NP_USERNAME=xxxx
KB_NP_PASSWORD=xxxx
KB_NP_ENV_URL=xxxx

ES_SBX_USERNAME=xxxx
ES_SBX_PASSWORD=xxxx
ES_SBX_ENV_URL=xxxx
KB_SBX_USERNAME=xxxx
KB_SBX_PASSWORD=xxxx
KB_SBX_ENV_URL=xxxx
