// developed by sunggook, MIT license.

if (chrome) {
    window.browser = chrome;
}

function resolveUrl(urlInput) {
    let url;
    const indexOfQuery = urlInput.indexOf('?');
    if (indexOfQuery !== -1) {
        url = urlInput.slice(0, indexOfQuery);
    } else {
        if (urlInput !== 'about:blank') {
            url = urlInput;
        }
    }
    return url;
}

function isSWCandiateByExt(url) {
    const indexOfExtension = url.lastIndexOf('.');
    if (indexOfExtension !== -1) {
        const extension = url.slice(indexOfExtension + 1)
        const extensionList = ['js', 'css', 'png', 'gif', 'jpg', 'html', 'svg']
        return extensionList.indexOf(extension) !== -1;
    }

    return false;
}

let urlList = []; // returning list.
let parser = null;

function UrlParser(url, sameOriginOnly, extensionOnly) {
    const _parser = new URL(url);
    const _sameOriginOnly = sameOriginOnly;
    const _extensionOnly = extensionOnly;
    // _parser.href = url;
    function _protocol() {
        return _parser.protocol;
    }

    function _hostname() {
        return _parser.hostname;
    }

    function _port() {
        return _parser.port;
    }

    function _path() {
        return _parser.pathname;
    }

    function _absolutePath() {
        return _parser.href;
    }

    function _isSameOrigin(comparedUrl) {
        const compared = document.createElement('a');
        compared.href = comparedUrl;
        if (_sameOriginOnly) {
            return _protocol() === compared.protocol && _hostname() == compared.hostname && _port() == compared.port;
        } else {
            return true;
        }
    }

    function _isAllowed (url) {
        if (_extensionOnly) {
            return isSWCandiateByExt(url);
        } else {
            return true;
        }
    }

    return {
        protocol: _protocol,
        hostname: _hostname,
        port: _port,
        absolutePath: _absolutePath,
        isOriginAcceptable: _isSameOrigin,
        isAllowed: _isAllowed,
    }
}

let eventUrlMap = {};
let sameOriginOnly = true;

function enableWebNavigationEvents() {
    urlList.length = 0;

    browser.webRequest.onBeforeRequest.addListener(
        (details) => {
            if (parser.isOriginAcceptable(details.url)) {
                const rUrl = resolveUrl(details.url);

                if (parser.isAllowed(rUrl)) {
                    // Do not filter the rUrl here, the filtering by extension or content-type
                    // will be done in the onComplete handler.
                    if (!eventUrlMap[rUrl]) {
                        let data = {
                            url:rUrl,
                            contentType:'unknown',
                            count: 0,
                            timeDiff:performance.now()
                        }
                        eventUrlMap[rUrl] = data;
                    }

                    if (rUrl.indexOf('service-worker.js') !== -1) {
                        browser.extension.getURL("hello.html")
                        return {redirectUrl: "https://www.myhttpSsite.com/test.js"};
                    } else {
                        return {cancel: false};
                    }
                }
            }
        }, 
        {urls: ["<all_urls>"]},
        ["blocking"]
    );

    browser.webRequest.onCompleted.addListener(
        (details) => {
            if (parser.isOriginAcceptable(details.url)) {
                const rUrl = resolveUrl(details.url);

                if (parser.isAllowed(rUrl)) {
                    // remove about:blank
                    if (eventUrlMap[rUrl]) {
                        let data = eventUrlMap[rUrl];
                        if (data.count === 0) {
                            data.timeDiff = Math.round(performance.now() - data.timeDiff);
                            for (item of details.responseHeaders) {
                                if (item.name === "Content-Type") {
                                    data.contentType = item.value;
                                    const index = data.contentType.indexOf(';');
                                    if (index !== -1) {
                                        data.contentType = value.slice(0, index);
                                    }
                                    break;
                                }
                            };

                            urlList.push(data);
                        } 
                        data.count++;
                    } else {
                        console.log('unexpected onCompleted: ' + rUrl);
                    }
                }
            }
        },
        {urls: ["<all_urls>"]},
        ["responseHeaders"]
    );
}

browser.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        let returnValue = false;
        switch (request.directive) {
            case "profiling":
                eventUrlMap = {}; // clean the previous object list
                parser = new UrlParser(request.targetUrl, request.sameOriginOnly, request.extensionOnly);

                if (parser.protocol() !== 'https:') {
                    // bail out if the protocol isn't https.
                    sendResponse({directive:'error', message:'HTTPS protocol is required'})
                    return;
                }

                let newTabId;
                let requestedUrl = request.targetUrl;
                // Enable WebNavigation and capture 10 s operation.
                enableWebNavigationEvents();

                setTimeout(function (e) {
                    // Send retuls to the Popup.
                    sendResponse({directive:'results', data: urlList, tabId: newTabId});

                    // browser.tabs.sendMessage(newTabId, {directive:'results', data: urlList});
                    // browser.tabs.query({url:requestedUrl}, (tabs) => {
                    //     tabs.forEach((tab) => {
                    //         // urlList has list of url during first 50 s.
                    //         browser.tabs.sendMessage(newTabId, {directive:'results', data: urlList});
                    //     })
                    // })
                }, 12000); //12s.

                // navigate and execcute script on new tab
                browser.tabs.create({
                    url: request.targetUrl,
                    selected: false
                }, (tab) => {
                    newTabId = tab.id;
                    browser.tabs.executeScript(tab.id, {
                         file:"contentscript.js",
                         allFrames: true
                    });
                });
                
                // Talk to listener that sendResponse is called asynchrnously.
                returnValue = true;
               break;
            default:
                // helps debug when request directive doesn't match
                alert("Unmatched request of '" + request + "' from script to background.js from " + sender);
        }

        return returnValue;
    }
);

