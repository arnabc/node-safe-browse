
var vows = require('vows'),
    assert = require('assert'),
    EventEmitter = require('events').EventEmitter,
    SafeBrowse = require('../lib/safe_browse'),
    Config = require('./config');


var apiKey = Config.apikey;
var client = Config.client;

// helper method to create the SafeBrowse object
function createSafeBrowseObj( key, clientName ) {
    return SafeBrowse( key, clientName );    
}

// Mixed URLs
var mixedUrls = [
    'http://quadnode.com',
    'http://google.com',
    // do not visit this link, it may harm your computer
    'http://beatageyer.com/projects/pages/google%2520site%2520check%2520malware.html',
    'http://benanshell.cz.cc',
    'http://gumblar.cn',
    'http://yahoo.com',
    'http://www.msn.com'
];

// Good URLs
var goodUrls = [
    'http://www.aol.com',
    'http://www.facebook.com',
    'http://mint.com',
    'http://twitter.com'
];

vows.describe('Safe Browse API')
    .addBatch( {
        'Should always identify the client app for sanity': {
            topic: [apiKey, null],

            'should generate error if client identity not specified': function ( topic ) {
                var error = 'Client name is required, it helps Google to indentify your Application';
                assert.throws( function () {
                    createSafeBrowseObj.apply( exports, topic );
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
    .addBatch( {

        'Test Multiple URLs with Mixed Content': {
            topic: function () {
                var sf = createSafeBrowseObj( apiKey, client );
                sf.lookup( mixedUrls, this.callback );
            },

            'should be null': function ( error, result ) {
                assert.isNull( error );
            },

            'should be an object': function ( error, result ) {
                assert.isObject( result );
            },

            'should have the key in the result object': function ( error, result ) {
                assert.include( result.data, 'http://quadnode.com' );
            },

            'should be ok': function ( error, result ) {
                assert.equal( 'ok', result.data['http://quadnode.com'] );
            },

            'should be malware': function ( error, result ) {
                assert.equal( 'malware', result.data['http://gumblar.cn'] );
            },

            'should be 200': function ( error, result ) {
                assert.equal( 200, result.statusCode );
            }
        },

        'Test all good URLs': {

            topic: function () {
                var sf = createSafeBrowseObj( apiKey, client );
                sf.lookup( mixedUrls, this.callback );
            },

            'should be null': function ( error, result ) {
                assert.isNull( error );
            },

            'should be an object': function ( error, result ) {
                assert.isObject( result );
            },

            'should be ok': function ( error, result ) {
                assert.equal( 'ok', result.data['http://twitter.com'] );
            },

            'should be 204': function ( error, result ) {
                assert.equal( 204, result.statusCode );
            }
        },

        'Test GET request using Bad URL': {
            topic: function () {
                var sf = createSafeBrowseObj( apiKey, client );
                sf.lookup( 'http://gumblar.cn', this.callback );
            },

            'should be null': function ( error, result ) {
                assert.isNull( error );
            },

            'should be an object': function ( error, result ) {
                assert.isObject( result );
            },

            'should be ok': function ( error, result ) {
                assert.equal( 'malware', result.data['http://twitter.com'] );
            },

            'should be 200': function ( error, result ) {
                assert.equal( 200, result.statusCode );
            }
        },

        'Test GET request using Good URL': {
            topic: function () {
                var sf = createSafeBrowseObj( apiKey, client );
                sf.lookup( 'http://twitter.com', this.callback );
            },

            'should be null': function ( error, result ) {
                assert.isNull( error );
            },

            'should be an object': function ( error, result ) {
                assert.isObject( result );
            },

            'should be ok': function ( error, result ) {
                assert.equal( 'ok', result.data['http://twitter.com'] );
            },

            'should be 204': function ( error, result ) {
                assert.equal( 204, result.statusCode );
            }
        }

    } )
    .export(module);