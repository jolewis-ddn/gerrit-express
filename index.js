const fetch = require('node-fetch')
// const sqlite3 = require('sqlite3')
const debug = require('debug')('index')
const fs = require('fs')
const config = require('config')
const NodeCache = require('node-cache')
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 })

const express = require('express')
const { Promise } = require('node-fetch')
const app = express()
const port = config.has('port') ? config.get('port') : 3000

function getHtmlHead(title = "Gerrit Report") {
  return(`<!doctype html>
  <html lang="en">
    <head>
      <!-- Required meta tags -->
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
  
      <!-- Bootstrap CSS -->
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-giJF6kkoqNQ00vy+HMDP7azOuL0xtbfIcaT9wjKHr8RbDVddVHyTfAAsrekwKmP1" crossorigin="anonymous">
  
      <title>${title}</title>
    <style>
      .TBD { background-color: gray; }
      .VerifiedPending2 { background-color: pink; }
      .VerifiedWith2 { background-color: lightgreen; }
      .VerifiedWith1 { background-color: yellow; }
      .VerifiedWith0 { background-color: orange; }
      .NotVerified { background-color: lightorange; }
    </style>
    </head>
    <body><h1>${title}</h1>`)
}

function getHtmlFoot() {
  return(`<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/js/bootstrap.bundle.min.js" integrity="sha384-ygbV9kiqUc6oa4msXn9868pTtWMgiQaeYH7/t7LECLbyPA2x65Kgf80OJFdroafW" crossorigin="anonymous"></script></body></html>`)
}

let reviewData = { cr0: [], cr1: [], cr2: [] }

app.get('/', async (req, res) => {
  getAndSaveOpenData().then((data) => {
    const report = getReport(data)

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.write(getHtmlHead())
    res.write(`<em>Data cached at: ${cache.get('reportDate')}`)
    // res.write('<ul class="list-group">')
    res.write(`<table class="table">
    <thead>
    <tr>
    <th scope="col">#</th>
    <th scope="col">V</th>
    <th scope="col">CR</th>
    <th scope="col">Subject</th>
    <th scope="col">Owner</th>
    <th scope="col">Project</th>
    <th scope="col"># Reviewers</th>
    <th scope="col">Reviewers</th>
    </tr>
    </thead><tbody>`)
    res.write(report)
    res.write('</tbody></table>')
    // res.write('</ul>')
    res.write(getHtmlFoot())
    res.end()
  })
})

function getReport(data) {
  if (!cache.has('reportData')) {
    reviewData = { cr0: [], cr1: [], cr2: [] }
    data.forEach((patch) => {
      processPatch(patch)
    })
    cache.set('reportData', formatPatchData())
    cache.set('reportDate', new Date())
  }
  return(cache.get('reportData'))
}

app.listen(port, () => {
  console.log(`App listening at port ${port}`)
})

function formatPatchData() {
  return(reviewData.cr2.concat(reviewData.cr1, reviewData.cr0).join(''))
}

function getVScore(patch) {
  let vScore = -999
  if (patch.labels.Verified && patch.labels.Verified.all) {
    vScore = patch.labels.Verified.all.filter((x) => x.name == 'jenkins')
      .map((x) => x.value)
    if (vScore == 1) { vScore = "+1" }
  }
  return(vScore)
}

function getCRScore(patch) {
  let crScore = -999
  if (patch.labels['Code-Review'] && patch.labels['Code-Review'].all) {
    crScore = patch.labels['Code-Review'].all.map(el => el.value).reduce((max, cur) => Math.max(max, cur))
  }
  return(crScore)
}

function getClass(patch) {
  // debug(`getClass(${patch._number}) called...`)
  const vScore = getVScore(patch)
  // debug(`...vScore = ${vScore}`)

  switch (vScore) {
    case "+1":
      // Check if reviewed with +1
      const crScore = getCRScore(patch)
      // debug(`crScore: ${crScore}`)
      if (crScore == 2) {
        return('VerifiedWith2')
        break;
      } else if (crScore == 1) {
        return('VerifiedWith1')
        break;
      } else if (crScore == 0) {
        return('VerifiedWith0')
        break;
      } else {
        debug(`invalid crScore of ${crScore} for ${patch._number}`)
        return('INVALID')
        break;
      }
      break;
    case "-1":
      return('NotVerified')
      break;
    default:
      // debug(`vScore not caught... ${vScore} for patch ${patch._number}`)
      return('NotVerified')
      break;
  }
}

function processPatch(patch) {
  const vScore = getVScore(patch)
  const crScore = getCRScore(patch)
  let resp = ``
  if (vScore == "+1") {
    const patchClass = getClass(patch)
    const reviewers = getCodeReviewers(patch)

    resp += `<tr class='${patchClass}'>
      <td><a href='${config.gerritUrlBase}/${patch._number}' target='_blank'>${patch._number}</a></td>
      <td>${vScore == "+1" ? "V" : "nv"}</td>
      <td>${crScore}</td>
      <td>${patch.subject}</td>
      <td>${patch.owner.name}</td>
      <td>${patch.project}</td>
      <td>${reviewers.length}</td>
      <td>
      `
    if (crScore < 2) {
      // resp += `<ul class='list-group'><li class='list-group-item ${patchClass}'>Reviewers: ${getCodeReviewers(patch).join('; ')}</li></ul>`
      resp += reviewers.join('; ')
    }
    resp += `</td></tr>`
    switch (crScore) {
      case 1:
        reviewData.cr1.push(resp)
        break;
      case 0:
        reviewData.cr0.push(resp)
        break;
      case 2:
        reviewData.cr2.push(resp)
        break;
      default:
        debug(`invalid crScore: ${crScore} for ${patch._number}`)
        break;
    }
  }
  return(true)
}

function getCodeReviewers(patch) {
  const reviewers = []
  if (patch.labels['Code-Review'] && patch.labels['Code-Review'].all) {
    patch.labels['Code-Review'].all.forEach((r) => {
      if (r.name !== 'jenkins') {
        reviewers.push(r.name + "(" + (r.value == "1" ? "+1" : r.value) + ")")
      }
    })
  }
  return(reviewers)
}

async function getAndSaveOpenData(forceRefresh = false) {
  return new Promise(async (resolve, reject) => {
    if (!cache.has(`openData`) || forceRefresh) {
      debug('fetching data: forceRefresh: ', forceRefresh)
      getGerritData('is:open').then((data) => {
        fs.writeFileSync(config.dataDir, JSON.stringify(data))
        cache.set(`openData`, data)
        resolve(data)
      })
    } else {
      debug('returning cached data')
      resolve(cache.get(`openData`))
    }
  })
}

async function getGerritData(query) {
  const response = await fetch(
    config.gerritUrlBase + config.gerritUrlPrefix + query + config.gerritUrlSuffix
  )
  const txt = await response.text()
  return cleanJson(txt)
}

/**
 * Convert Gerrit output to parsed JSON
 *
 * @param {string} rawData Unprocessed output from Gerrit
 * @returns Parsed JSON
 */
function cleanJson(rawData) {
  if (rawData.split(/\r?\n/)[0] == ")]}'") {
    let origData = rawData.split(/\r?\n/)
    origData.shift()
    rawData = origData.join('')
  }
  return JSON.parse(rawData)
}
