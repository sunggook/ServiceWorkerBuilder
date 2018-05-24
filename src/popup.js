// Copyright (c) 2011 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @filedescription Initializes the extension's popup page.
 */

if (chrome) {
    window.browser = chrome;
}

function generateList(response) {
    // response format:
    // [{url: , numRequests: , average: }]
    let section = document.querySelector('body>section');
    const results = response.data;
    const oldElement = document.getElementById('showListTable');
    if (oldElement) {
        section.removeChild(oldElement);
    }

    let table = document.createElement('table');
    table.id = 'showListTable';

    let tr, th, td;

    // Draw head
    tr = document.createElement('tr');
    // 'fetch on SW': fetch will happen in the SW, and pass the data to the main page when file isn't cached.
    // 'fetch on main': fetch will happen in the main when file isn't in the cache, but SW continue to fetch the file during idle time,
    //                  and cache it.
    // 'both': fetch will happen on both of main and SW, and the code will use the first loaded one.
    const headers = ['index', 'SW', 'Client', 'SW-Client', 'count', 'timeDiff', 'type', 'url']

    for (let i = 0; i < headers.length; i++) {
        th = document.createElement('th');
        th.textContent = headers[i];
        tr.appendChild(th);
    }
    table.appendChild(tr);

    // Draw data cell.
    function createAndAppend(tr, tdText, input, inputId, enabled) {
        let td = document.createElement('td');
        if (input) {
            let checkBox = document.createElement('input');
            checkBox.type = "radio";
            if (enabled) {
                checkBox.checked = true;
            }
            checkBox.id = inputId;

            checkBox.addEventListener('click', (evt) => {
                evt.target.checked = true; // enable select radio button.

                const trElement = evt.target.parentNode.parentNode;
                const inputs = trElement.getElementsByTagName('input');
                for (input of inputs) {
                    if (input.id !== evt.target.id) {
                        // disable other radio button.
                        input.checked = false;
                    }
                };
            });

            td.appendChild(checkBox);
        } else {
            td.textContent = tdText;
        }

        tr.appendChild(td);
    }

    for (let i = 0; i < results.length; i++) {
        tr = document.createElement('tr');
        createAndAppend(tr, i.toString());      // index
        createAndAppend(tr, '', true, 'sw');    // check box, 'fetch on SW and return response'
        createAndAppend(tr, '', true, 'client');    // check box, 'fetch on client only'
        createAndAppend(tr, '', true, 'sw.client', true);    // check box, 'fetch on SW, but return null body'
        createAndAppend(tr, results[i].count);   // count
        createAndAppend(tr, results[i].timeDiff);  // timedif
        createAndAppend(tr, results[i].contentType);  // timedif
        createAndAppend(tr, results[i].url);   // url

        table.appendChild(tr);
    }

    section.innerHTML = '';
    section.appendChild(table);
    section.style.display = 'block';
}

function replaceTitle() {
    let clickme = document.getElementById('clickme');
    clickme.style.display = 'none';

    // create new menu
    let results = document.getElementById('results');
    results.style.display = 'block';
}

function showDescription() {
    // The function is called after it sent a message to download the service worker with selected list.
    // Now, it hide list of selection window, instead show decription of what user needs to do.
    let section = document.querySelector('body>section');
    section.style.display = 'none';

    let menu = document.getElementById('menu');
    menu.style.display = 'none';

    let description = document.getElementById('description');

     
    description.innerHTML = `
        <div class="desc_download">
            Download the service-worker.js and placed it under the root folder.
        </div>
        <br>
        <br>
        <div class="desc_explain"> Copy and paste the below code to the main js file.</div>
			  <br>
        <div class="desc_code">
            if ('serviceWorker' in navigator) { <br>
                &nbsp;&nbsp;&nbsp;&nbsp; navigator.serviceWorker.register('service-worker.js', {scope: "${scope}"}) <br>
                &nbsp;&nbsp;&nbsp;&nbsp;.then ((reg) => { <br>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;console.log('service worker is registered successfully, scope is ${scope}'); <br>
                &nbsp;&nbsp;&nbsp;&nbsp;}).catch((e) => { <br>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;console.log('service worker registration failed'); <br>
                &nbsp;&nbsp;&nbsp;&nbsp;}); <br>
            } <br>
        </div> <br>
    `
}

let scope;
let newTabId;
function generateSW() {
    let fileListTable = document.getElementById('showListTable');
    
    let selectedList = [];
    // It starts from the td, which is second row from the top.
    for (let i = 1; i < fileListTable.rows.length; i++) {
        const row = fileListTable.rows[i];
        const url = scope + row.cells[7].textContent;
        if (row.cells[1].children[0].checked) {
            selectedList.push({url:url, fetchOnSW:true});
        } else if (row.cells[2].children[0].checked) {
            // fetch happen on both sides, and return null to client and fetch and store on service worker
            // if the requested isn't on the store.
            selectedList.push({url:url, fetchOnClient:true});
        } else if (row.cells[3].children[0].checked) {
            // fetch happen on both sides, and return null to client and fetch and store on service worker
            // if the requested isn't on the store.
            selectedList.push({url:url, fetchOnSWClient:true});
        }
    }

    // send a message after 20 s for preparing contentScript debug.
    browser.tabs.sendMessage(newTabId, {directive: 'download', scope:scope, list: selectedList});

    // Register the service worker.
    showDescription();
}

function clickHandler(e) {
    scope = document.getElementById('input-scopeUrl').value;
    const sameOriginOnly = document.getElementById('sameOrigin').checked;
    browser.runtime.sendMessage({directive: "profiling", targetUrl:scope, sameOriginOnly:sameOriginOnly}, (response) => {
        switch (response.directive) {
            case 'error':
                alert('Error: ' + response.message);
                break;
            case 'results':
                replaceTitle();
                newTabId = response.tabId;
                generateList(response);

                break;
            default:
                alert('Unexpected respose');
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('click-me').addEventListener('click', clickHandler);
    document.getElementById('generate_click').addEventListener('click', generateSW);
})

