
var vows = require('vows'),
    assert = require('assert'),
    EventEmitter = require('events').EventEmitter,
    SafeBrowse = require('../lib/safe_browse'),
    Config = require('./config.js');


var apiKey = Config.apikey;
var client = Config.client;

// helper method to create the SafeBrowse object
function createSafeBrowseObj( key, clientName ) {
    return SafeBrowse( key, clientName );    
}

vows.describe('Safe Browse API')
    .addBatch( {
        'Should always identify the client app for sanity': {
            topic: [apiKey, null],

            'should generate error if client identity not specified': function ( topic ) {
                var error = 'Client name is required, it helps Google to indentify your Application';
                assert.throws( function () {
                    createSafeBrowseObj.apply( exports, topic /* array of apikey and client */ );
                }, 
                new RegExp( error ) );
            }
        },

        'Should throw error if invalid URI/URIs provided': {

            topic: createSafeBrowseObj( apiKey, client ),

            'URI is undefined/null/empty': function ( topic ) {
                var error = 'Specified URL is not a valid one';
                assert.throws( function () {
                    topic.lookup();
                },
                new RegExp(error) );
            },

            'URI is not as per RFC-3986': function ( topic ) {
                var error = 'Specified URL is not a valid one';

                assert.throws( function () {
                    topic.lookup( '/invalid/url/scheme' );
                }, 

                new RegExp(error) );
            },

            'None of the URLs are valid for multiple URL verification': function ( topic ) {
                var urls = [
                    '/invalid/url/scheme',
                    '/invalid/url/scheme1'
                ], 
                error = 'No URL to look up, check the supplied list whether it contains valid URLs or not';

                assert.throws( function () {
                    topic.lookup( urls );
                },
                new RegExp(error) );
            },

            'Number of URLs provided has exceeded the MAX allowed limit of 500 URLs': function ( topic ) {
                var error = 'Total number of URLs has exceeded the maximum allowed limit of 500';
                assert.throws( function () {
                    var urls = Array(600);
                    topic.lookup( urls );
                },
                new RegExp(error)
                );
            }
        }
    } )
    .export(module);

