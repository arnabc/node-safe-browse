/*
Copyright (c) 2011 Arnab Chakraborty <arnabc@webgyani.com>

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/


var _       = require('underscore'),
    request = require('request'),
    http    = require('http'),
    url     = require('url'),
    util    = require('util'),
    qs      = require('querystring'),
    EventEmitter = require('events').EventEmitter;


// Number of URLs which can be verified at once
// sending all URLs to google
const MAX_NUMBER_OF_URLS_ALLOWED = 500;

const Errors = {
    CLIENT_NAME: 'Client name is required, it helps Google to indentify your Application',
    MAX_URLS_ALLOWED: 'Total number of URLs has exceeded the maximum allowed limit of ' + MAX_NUMBER_OF_URLS_ALLOWED,
    INVALID_URL: 'Specified URL is not a valid one. Refer to the documentation for valid URLs',
    NO_URL_TO_LOOKUP: 'No URL to look up, check the supplied list whether it contains valid URLs or not'
};

// @credit http://af-design.com/blog/2008/03/14/rfc-3986-compliant-uri-encoding-in-javascript/
/**
 * Necessary to override the QueryString module's escape() method
 * to make it compliant with RFC-3986. JavaScript's encodeURIComponent()
 * does not percent encode these characters ("!", "*", "(", ")", "'" ), in
 * order to make the escaping compliant with RFC-3986 which has reserved the
 * above mentioned characters, we need to override this method.
 *
 * @param str
 */
qs.escape = function (str) {
    var s =  encodeURIComponent(str);
    s = s.replace('!','%21');
    s = s.replace('*','%2A');
    s = s.replace('(','%28');
    s = s.replace(')','%29');
    s = s.replace("'",'%27');
    return s;
}


// SafeBrowse module
var SafeBrowse = module.exports = function SafeBrowse( apikey, clientName, params ) {

    if( !clientName ) {
        throw new Error( Errors.CLIENT_NAME );
    }

    var defaults = {
        client: clientName,
        apikey: apikey,
        appver: '1.0.0', // format = major.minor.patch
        pver: '3.0' // format = major.minor
    };

    // param should be an object literal
    if( !params ) {
        params = {};
    }

    var GOOGLE_API = params.api || 'https://sb-ssl.google.com/safebrowsing/api/lookup';
    delete params.api; // remove the API if provided    

    // one can optionally enable debugging
    var $DEBUG = !!(params.debug);
    delete params.debug;

    // merge specified params with the default one
    params = _.defaults(params, defaults);


    // Utility log method
    var log =  $DEBUG
                ? function () { console.log.apply(console, arguments ); }
                : function (){}


    /**
     * Utility class which encapsulates the implementation for
     * for API request
     * @constructor
     */
    function SafeBrowseApi() {
        EventEmitter.call(this);
    }

    util.inherits(SafeBrowseApi, EventEmitter );
           
    /*
     * Utility method to lookup an URL or a set of URLs for malware/phishing safety
     * @param {Array|String} uri
     * @chainable
     */               
    SafeBrowseApi.prototype.lookup = function ( uri, callback ) {
        var type = 'get'
          , len
          , options = {}
          , qparams = _.clone( params )
          , self = this;
        
        // if nothing specified, then bark at the user :-)
        if( !uri ) {
            throw new Error( Errors.INVALID_URL );
        }

        // uri is an array then the request type must be POST
        // in order to send multiple URLs to verify to Google
        if( Array.isArray( uri ) ) {
            type = 'post';

            log( 'Request type: POST' );

            // check max number of urls
            if( uri.length > MAX_NUMBER_OF_URLS_ALLOWED ) {
                throw new Error( Errors.MAX_URLS_ALLOWED );
            }

            // sort the array 
            uri.sort();

            // discard invalid urls
            var parsedUrls = uri.filter( function ( u ) {
                return ( u && isValidURL( u ) ? u : undefined );
            } );

            if( !parsedUrls.length ) {
                throw new Error( Errors.NO_URL_TO_LOOKUP );
            }

            // discard duplicate items
            parsedUrls = _.unique( parsedUrls, true /* isSorted */ );

            // length needs to be sent to the request body
            // as per API requirement
            parsedUrls.unshift( parsedUrls.length );

            options.uri = buildQueryStringURL( qparams );
            options.body = parsedUrls.join( '\n' );

            log( 'Request URI:\n %s', options.uri );
            log( 'Request Body:\n %s', options.body );

            log( 'Total URLs to look up after processing: %d', parsedUrls[0] );
        }


        // GET requests
        if( type == 'get' ) {
            log( 'Request type: GET' );

            // check URL validness
            if( !isValidURL( uri ) ) {
                throw new Error( Errors.INVALID_URL );
            }

            qparams.url = uri;
            options.uri = buildQueryStringURL( qparams );

            log( 'URL to be looked up: %s', options.uri );
        }

        // Make the request
        log( 'Sending request to Google...' );
        request[type]( options, responseCallback );


        // ==== Utility inner functions ====

        /**
         * Utility method to check for URL validity
         * @param u
         */
        function isValidURL( u ) {
            var o = url.parse(u);
            return !!(o.protocol && o.hostname );
        }

        /**
         * Utility method to generate the GET URL for lookup
         * @param u
         * @param params
         */
        function buildQueryStringURL( p /* params hash */) {
            return ( GOOGLE_API + '?' + qs.stringify( p ) );
        }

        function responseCallback( error, response, body ) {
            var data;

            log('Response Status: %d', response.statusCode );
            log('Raw Response Body: %s', body );

            function callbackOrEvent( event, args ) {
                if( _.isFunction( callback ) ) {
                    if( event == 'error' ) {
                        callback( args );
                    } else {
                        callback( null, args );
                    }
                } else {
                    self.emit( event, args );    
                }
            }

            if( error ) {
                return callbackOrEvent( 'error', error );
            }
            
            // the Google Safe Browsing API returns the following response codes
            // for invalid requests which can be considered as Errors
            // 400, 401, 503

            // indexOf uses Strict Matching(===), hence parseInt()
            if( [400, 401, 503 ].indexOf( parseInt( response.statusCode, 10 ) ) > -1 ) {
                return callbackOrEvent( 'error', new Error(response.statusText) );
            } else {
                // assume it's 200 or 204
                data = prepareData( response, body );
                callbackOrEvent( 'success', data );
            }

            log( 'Finished.' );
        }

        function prepareData( response, body ) {
            var retVal = {
                statusCode: response.statusCode,
                data: {}
            },
            results;

            if( type == 'get' ) {
                // @TODO need to parse Response Body for the exact Response in case of 200
                retVal['data'][uri] = response.statusCode == 204 ? 'ok' : 'malware';
            } else {
                // the first element in parsedUrls array is the
                // total number of URLs, we need to shift that out
                parsedUrls.shift();

                // NONE of the specified URLs matched, all clean!
                if( response.statusCode == 204 ) {
                    parsedUrls.forEach( function ( value, index ) {
                        retVal['data'][value] = 'ok';
                    } );
                }
                // AT LEAST ONE of the specified URLs matched
                else {
                    results = body.split('\n');

                    results.forEach( function ( value, index ) {
                        retVal['data'][ parsedUrls[index] ] = value;
                    } );
                }
            }

            return retVal;
        }

        return this; // for chaining
    }


    return new SafeBrowseApi();
}