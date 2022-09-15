/*MIT License
This project is based on https://github.com/ottopaulsen/MMM-NesteBussAtB, modify by Quentin Delahaye.

Copyright (c) 2018 Otto Paulsen


Copyright (c) https://github.com/ottopaulsen/MMM-NesteBussAtB

Copyright (c) 2019 Quentin Delahaye


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

var NodeHelper = require("node_helper");
var request = require('request');
var convert = require('xml-js');
var https = require('https');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var jsdom = require("jsdom").JSDOM;
var DOMParser = require('xmldom').DOMParser;
var xpath = require("xml2js-xpath");
var xml2js = require("xml2js");

module.exports = NodeHelper.create({

    start: function () {
        console.log(this.name + ': Starting node helper');
    },

    socketNotificationReceived: function (notification, payload) {
        console.log(this.name + ': Received socket notification ' + notification);
        var self = this;
        var buses = new Map();
        if (notification == 'BDXBUS_CONFIG') {
            console.log(self.name + ': BdxB Connection started');

            self.readBuses(payload, buses);
           setInterval(function () {
                self.readBuses(payload, buses);
            }, 60000);
        }
    },

    readBuses: function (config, buses) {
        var self = this;
        stops = config.stopUrl;
        stops.forEach(function (stopId) {
            var stopBuses = [];
            
            self.getBdxStopTimes(config, stopId, function (error, data) {
                if (!error) {
                    var routes = new Map();

                    for (i = 0; i < data.buses.length; i++) {
                        var bus = data.buses[i];
                        var key = bus.line.trim() + bus.name.trim();
                        var routeCount = routes.has(key) ? routes.get(key) : 0;
                        var minutes = bus.time;
                        if (routeCount < config.maxCount) {
                            routeCount++;
                            routes.set(key, routeCount);

                            stopBuses.push({
                                number: bus.line.trim(),
                                from: bus.name.trim(),
                                to: bus.destination.trim(),
                                time: bus.time
                            });
                        }
                    }
                    buses.set(stopId, stopBuses);
                    self.broadcastMessage(buses);
                } else {
                    console.error(self.name + ': Request error: ' + error);
                }
            });
        });
    },

    broadcastMessage: function (buses) {
        self = this;
        busArr = [];
        buses.forEach(function (stop) {
            stop.forEach(function(bus) {
                busArr.push(bus);
            });
        });
        //busArr.sort(function (a, b) {
       //     return (self.toDate(a.time) - self.(b.time));
       // });
        filteredBuses = busArr.filter(function (el, i, a) {
            return !self.duplicateBuses(el, a[i - 1]); 
        });
        self.sendSocketNotification('BUS_DATA', filteredBuses);
    },

    printBuses(label, b) {
        console.log(label);
        for (i = 0; i < b.length; i++) {
            console.log('Bus ' + i + ': Line ' + b[i].number + ' from ' + b[i].from + ' to ' + b[i].to + ' time ' + b[i].time);
        }
    },

    duplicateBuses: function (a, b) {
        if (!a) return false;
        if (!b) return false;
        if (a.number != b.number) return false;
        if (a.from != b.from) return false;
        if (a.to != b.to) return false;
        if (a.time != b.time) return false;
        return true;
    },

    
   
    getBdxStopTimes: function (config, stopId, handleResponse) {
        var self = this;
        // Get web page contents.
        var xmlhttp = new XMLHttpRequest();
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        xmlhttp.onreadystatechange = function() 
        {
            err = 0;
            result = {
                timestamp: '',
                buses: []
            }
            if ( xmlhttp.readyState == 4 && xmlhttp.status == 200 ) 
            {
                result.timestamp = Date.now() ;
                parser = new DOMParser();
                textHtml = xmlhttp.responseText;

                position = 0;
                var textHtmlOrigin = textHtml;
                // Get station name in html page.
                var stationName = self.getStationName( textHtml );
                // Collect all bus hour in the html pages
                self.getAllBusHoraire( textHtmlOrigin , result, position, stationName );
                handleResponse( err, result );
            }
        };

        xmlhttp.open("GET", stopId, true);
        xmlhttp.send();
     },
     
    /*
        getAllBusHoraire : Get bus time.
        textHtmlOrigin: Html page content
        result: list of result
        position: Position in the full html  content
        stationName: name of the station.
    */
    getAllBusHoraire: function (textHtmlOrigin, result, position, stationName  ) {
        var self = this;
        textHtml = textHtmlOrigin;
        // Get balise that contains bus time.
        var positionInAllHtml = textHtml.indexOf("<div class=\"horaires-bus\">", position);
        // If no bus data, exit from the function.
        if(positionInAllHtml === -1) return;

        // Get the end of the balise and extract the content.
        textHtml = textHtml.substr(positionInAllHtml );
        var position = textHtml.indexOf("</div>", 0);
        position = textHtml.indexOf("</div>", position  + 1);
        position = position  + 6; // Add 6 for "</div>" element size.
        textHtml = textHtml.substr(0, position);
        //console.log("textHtml: " + textHtml);

        var title = "";
        var direction  = "";
        var time  = new Array ();
        time[0] = "Pas de Bus";
        xml2js.parseString(textHtml , function(err, json) 
        {
            if(err !== null ) return;

             // find the first element, and get its id:
            title  = xpath.evalFirst(json, "//img", "title");
            direction = (xpath.find(json,"//span[@class='direction bold']"))[0]["_"];
            hours = (xpath.find(json,"//span"))[2];
            var itrHour = 0;
            for(var i = 0; i <hours["span"].length; i++) 
            {
                if( hours["span"][i]["$"]["class"] == "horaires-bold")
                {
                    time[itrHour] = hours["span"][i]["_"];
                    itrHour  ++;
                }
            }
        });
        
        var timePrint = time[0] ;
        if(time.length > 1)
        {
            timePrint = time[0] + " - " + time[1];
        }

        result.buses.push( {
                                line: title ,
                                destination: direction ,
                                time: timePrint ,
                                name: stationName  
                           });

        if(textHtmlOrigin.indexOf("<div class=\"horaires-bus\">", positionInAllHtml + 20) != -1)
        {
            // Recursive Fonction
            // We continue to collect hour bus for the same station.
            self.getAllBusHoraire(textHtmlOrigin, result, positionInAllHtml + 20, stationName  );
        }
    },

    /*
        getStationName : Get station name from web page.
        textHtmlOrigin: Html page content
    */
 getStationName: function (textHtmlOrigin) 
 {
    var stationName = "";
    textHtml = textHtmlOrigin;
    // Extract the content.
    var position = textHtml.indexOf("<div class=\"header-sd-default\">", 0);
    textHtml = textHtml.substr(position);
    position = textHtml.indexOf("</div>", 0);
    position = position  + 6; // Add 6 for "</div>" element size.
    textHtml = textHtml.substr(0, position);
    // Convert the xml to json.
    xml2js.parseString(textHtml , function(err, json) {
        // Find the station Name.
        stationName = (xpath.find(json,"//span[@class='header-sd-title']"))[0]["_"];
    });
    return stationName ;
}

});
