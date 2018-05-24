if (chrome) {
    window.browser = chrome;
}

console.log("SW Builder Content Script");

// Register service worker if not registered already.
if ('serviceWorker' in navigator) {
    // navigator.serviceWorker.register('service-worker.js');
}

/* 
Type of fetch:
1. fetch on the SW, if not exist, fetch in SW and return it. (FECHED_ON_SW)
2. fetch on the SW, if not exist, return instantly meanwhile store background. (FECHED_ON_SW_CLIENT)
3. return empty so client could fetch. (FECHED_ON_CLIENT)
*/

function createJSCode(urlList) {
    const defaultServiceWorkerCode = `

const PRECACHE = 'sw-preCache';
const RUNTIME = 'runtime';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(PRECACHE)
        .then(cache => {
            cache.addAll(FECHED_ON_SW)
        })
        .then(self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    const currentCaches = [PRECACHE, RUNTIME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
        }).then(cachesToDelete => {
            return Promise.all(cachesToDelete.map(cacheToDelete => {
                return caches.delete(cacheToDelete);
            }));
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.startsWith(self.location.origin)) {
        var path = event.request.url;

        if (FECHED_ON_CLIENT.indexOf(path) !== -1) {
            // target request should be handled in the client even without attempt 
            return;
        } else if (FECHED_ON_SW.indexOf(path) !== -1 || FECHED_ON_SWCLIENT.indexOf(path) !== -1) {
            // defer checking caches.
            event.respondWith(
                caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    if (FECHED_ON_SW.indexOf(path) !== -1) {
                        return caches.open(RUNTIME).then(cache => {
                            return fetch(event.request).then(response => {
                                return cache.put(event.request, response.clone()).then(() => {
                                    console.log("[SW] fetch and return on SW: " + event.request.url);
                                    return response;
                                });
                            });
                        });
                    } else {
                        caches.open(RUNTIME).then(cache => {
                            fetch(event.request).then(response => {
                                cache.put(event.request, response);
                                console.log("[SW] fetch on client and cache on SW: " + event.request.url);
                            });
                        });
                        return new Response(); // null body returns will let client fetch on the client.
                    }
                })
            );
        }
    }
});
`

    // Keep the coding style.
    let urlListOnFetchSW = '';
    let urlListOnFetchClient = '';
    let urlListOnFetchSWClient = '';

    urlList.forEach((data) => {
            switch (data.fetchOn) {
                case 'fetchOnSW':
                    urlListOnFetchSW += `
        "${data.url}",`
                    break;
                case 'fetchOnClient':
                urlListOnFetchClient += `
        "${data.url}",`
                    break;
                case 'fetchOnSWClient':
                urlListOnFetchSWClient += `
        "${data.url}",`
                    break;
            }
    })

    let preCacheListStringOnSW = `var FECHED_ON_SW = [ ${urlListOnFetchSW} 
    ]`;

    let preCacheListStringOnClient = `var FECHED_ON_CLIENT = [ ${urlListOnFetchClient} 
    ]`;

    let preCacheListStringOnSWClient = `var FECHED_ON_SWCLIENT = [ ${urlListOnFetchSWClient} 
    ]`;

    const serviceWorkerCodeWithSelectedList = `${defaultServiceWorkerCode}

    ${preCacheListStringOnSW}

    ${preCacheListStringOnClient}

    ${preCacheListStringOnSWClient}

    `
    return serviceWorkerCodeWithSelectedList;
    }

    function downloadAsBlob(jsCode) {
        let makeTextFile = function (text) {
            let data = new Blob([text], { type: 'text/plain' });
            // if (textFile !== null) {
            //     window.URL.revokeObjectURL(textFile);
            // }

            // let testBlob = window.URL.createObjectURL('this is test');
            return window.URL.createObjectURL(data);
        }

        function download(filename, blobUrl) {
            console.log(`download: ${filename}, ${blobUrl}`);

            var pom = document.createElement('a');

            pom.href = blobUrl;
            pom.download = filename;
            // pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
            // pom.setAttribute('download', filename);

            if (document.createEvent) {
                var event = document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                pom.dispatchEvent(event);
            }
            else {
                pom.click();
            }
        }

        download('service-worker.js', makeTextFile(jsCode));
    }

function normalizeUrl(scope, urlList) {
    // urlList would include scope as its first domain and path.
    // if the url doesn't match with scope, then it will not be added.
    
    // eg. scope: https://www.bing.com
    // url: https://www.bing.com/images/foo.png

    const lowerScope = scope.toLowerCase();

    let normalizedUrlList = [];
    urlList.forEach((data) => {
        const urlLower = data.url.toLowerCase();
        console.log(`[SW Builder] url - ${urlLower}`);
        if (urlLower.indexOf(lowerScope) === 0) {
            const candidate = urlLower.substring(lowerScope.length);

            console.log(`candiate: ${candidate}`);
            let fetchOn;
            if (data.fetchOnSW) {
                fetchOn = 'fetchOnSW';
            } else if (data.fetchOnClient) {
                fetchOn = 'fetchOnClient';
            } else if (data.fetchOnSWClient) {
                fetchOn = 'fetchOnSWClient';
            }
            normalizedUrlList.push({url:candidate, fetchOn:fetchOn});
        }
    })
    return normalizedUrlList;
}

browser.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.directive === 'register') {
            console.log('[SW Builder] register service worker');

            //  urlList.push({url:rUrl, count: data.maxCount, timeDiff:e.timeStamp - data.timeStamp});
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('service-worker.js');
            }
        } else if (request.directive === 'download') {
            // generate service-worker file
            console.log(`[SW Builder] scope - ${scope}`);
            const normalizedUrlList = normalizeUrl(request.scope, request.list);

            console.log(`[SW Builder] normalizedUrlList - ${normalizedUrlList}`);
            if (normalizedUrlList) {
                const jsCode = createJSCode(normalizedUrlList);
                downloadAsBlob(jsCode);
            } else {
                alert(`no valid Urls for service worker under ${request.scope} are found`)
            }
        }
    }
)