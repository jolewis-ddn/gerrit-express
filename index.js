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

const NO_DATA = -999

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
      .WIP { background-color: lightgray; }
      .VerifiedPending2 { background-color: pink; }
      .VerifiedWith2 { background-color: lightgreen; }
      .VerifiedWith1 { background-color: lightyellow; }
      .VerifiedWith0 { background-color: orange; }
      .VerifiedWithNeg1 { background-color: rgb(251 202 202 / 49%); }
      .VerifiedWithNeg2 { background-color: rgb(251 202 202 / 100%); }
      .NotVerified { background-color: lightblue; }
      .legendCell { width: 40px; text-align: center; padding: 5px; }
    </style>
    </head>
    <body>
    <table class="sticky-top start-100" style="border-color:white; border-style:solid;" border=3>
    <tr>
    <th class="bg-light">Legend: </th>
    <td class='legendCell VerifiedWith2'>V+1/CR+2</td>
    <td class='legendCell VerifiedWith1'>V+1/CR+1</td>
    <td class='legendCell VerifiedWith0'>V+1/CR&nbsp;0</td>
    <td class='legendCell VerifiedWithNeg1'>V+1/CR&nbsp;-1</td>
    <td class='legendCell VerifiedWithNeg2'>V+1/CR&nbsp;-2</td>
    <td class='legendCell WIP'>WIP</td>
    <td class='legendCell NotVerified'>Not&nbsp;Ver</td>
    </tr>
    </table>
    <h1>${title}</h1>
    `)
}

function getHtmlFoot() {
  return(`<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/js/bootstrap.bundle.min.js" integrity="sha384-ygbV9kiqUc6oa4msXn9868pTtWMgiQaeYH7/t7LECLbyPA2x65Kgf80OJFdroafW" crossorigin="anonymous"></script></body></html>`)
}

let reviewData = resetReviewData()

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
      <!-- th scope="col"># Reviewers</th -->
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

function pushRow(vScore, crScore, row, isWip = false) {
  debug(`pushRow(${vScore}, ${crScore}, row, ${isWip}) called...`)
  if (isWip) {
    reviewData.wip.push(row)
  } else {
    debug(`reviewData.nonWip[${convertVScoreToIndex(vScore)}][${convertCRScoreToIndex(crScore)}].push(row)`)
    reviewData.nonWip[convertVScoreToIndex(vScore)][convertCRScoreToIndex(crScore)].push(row)
  }
}

function convertVScoreToIndex(score) {
  switch (score) {
    case -1:
      return(0)
    case 0:
      return(1)
    case 1:
    case "+1":
      return(2)
    default:
      debug(`convertVScoreToIndex(${score})... unrecognized VScore value!`)
      return(3)
  }
}

function convertCRScoreToIndex(score) {
  switch (score) {
    case -2:
      return(0)
    case -1:
      return(1)
    case 0:
      return(2)
    case 1:
    case "+1":
      return(3)
    case 2:
    case "+2":
      return(4)
    default:
      debug(`convertCRScoreToIndex(${score})... unrecognized CR score value!`)
      return(5)
  }
}

/* Ver:
   0: cr-2, cr-1, cr0, cr1, cr2, crX (where X is unknown/invalid)
  +1: cr-2, cr-1, cr0, cr1, cr2, crX
  -1: cr-2, cr-1, cr0, cr1, cr2, crX
  Invalid: cr-2, cr-1, cr0, cr1, cr2, crX
 */

function resetReviewData() {
  return({ wip: [],
        nonWip: [
          [ [], [], [], [], [], [] ], // 0
          [ [], [], [], [], [], [] ], // +1
          [ [], [], [], [], [], [] ],  // -1
          [ [], [], [], [], [], [] ]  // Invalid
        ]
      })
}

function getReport(data) {
  if (!cache.has('reportData')) {
    reviewData = resetReviewData()
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
  // debug(reviewData)
  return(
    reviewData.nonWip[convertVScoreToIndex(+1)][convertCRScoreToIndex(2)].concat(
      reviewData.nonWip[convertVScoreToIndex(+1)][convertCRScoreToIndex(1)],
      reviewData.nonWip[convertVScoreToIndex(+1)][convertCRScoreToIndex(0)],
      reviewData.nonWip[convertVScoreToIndex(+1)][convertCRScoreToIndex(-1)],
      reviewData.nonWip[convertVScoreToIndex(+1)][convertCRScoreToIndex(-2)],
      reviewData.wip,
      reviewData.nonWip[convertVScoreToIndex(0)][convertCRScoreToIndex(2)],
      reviewData.nonWip[convertVScoreToIndex(0)][convertCRScoreToIndex(1)],
      reviewData.nonWip[convertVScoreToIndex(0)][convertCRScoreToIndex(0)],
      reviewData.nonWip[convertVScoreToIndex(0)][convertCRScoreToIndex(-1)],
      reviewData.nonWip[convertVScoreToIndex(0)][convertCRScoreToIndex(-2)],
      reviewData.nonWip[convertVScoreToIndex(-1)][convertCRScoreToIndex(2)],
      reviewData.nonWip[convertVScoreToIndex(-1)][convertCRScoreToIndex(1)],
      reviewData.nonWip[convertVScoreToIndex(-1)][convertCRScoreToIndex(0)],
      reviewData.nonWip[convertVScoreToIndex(-1)][convertCRScoreToIndex(-1)],
      reviewData.nonWip[convertVScoreToIndex(-1)][convertCRScoreToIndex(-2)]
    ).join('')
  )
  // return(reviewData.cr2.concat(
  //         reviewData.cr1, 
  //         reviewData.cr0, 
  //         reviewData.crNeg1, 
  //         reviewData.crNeg2, 
  //         reviewData.wip, 
  //         // reviewData.ver0, 
  //         reviewData.ver0cr2, 
  //         reviewData.ver0cr1, 
  //         reviewData.ver0cr0, 
  //         reviewData.verNeg1
  //       ).join(''))
}

function getVScore(patch) {
  let vScore = NO_DATA
  if (patch.labels.Verified && patch.labels.Verified.all) {
    // vScore = patch.labels.Verified.all.filter((x) => x.name == 'jenkins')
    vScore = patch.labels.Verified.all
      .map((x) => x.value ? x.value : 0)
    
    vScoresMax = vScore.reduce((max, cur) => Math.max(max, cur))
    vScoresMin = vScore.reduce((min, cur) => Math.min(min, cur))
    
    if (patch._number == "5029") {
      debug(`5029: `, vScore, vScoresMax, vScoresMin)
    }

    if (vScoresMax == 1) { 
      vScore = "+1"
    // } else if (typeof vScore == "object" && vScore[0] == [ -1 ]) {
    } else if (vScoresMin == -1) {
      return(-1)
    } else {
      return(0)
    }
  }
  return(vScore)
}

function getCRScore(patch) {
  let crScore = NO_DATA
  if (patch.labels['Code-Review'] && patch.labels['Code-Review'].all) {
    crScores = patch.labels['Code-Review'].all.map(el => el.value)
    crScoresMax = crScores.reduce((max, cur) => Math.max(max, cur))
    crScoresMin = crScores.reduce((min, cur) => Math.min(min, cur))
    if (crScoresMax == 2 && crScoresMin == 0) {
      crScore = "+2"
    } else if (crScoresMax == 1 && crScoresMin == 0) {
      crScore = "+1"
    } else {
      crScore = crScoresMin
    }
  }
  return(crScore)
}

function getClass(patch) {
  // debug(`getClass(${patch._number}) called...`)
  if (patch.work_in_progress) {
    return('WIP')
  } else {
    const vScore = getVScore(patch)
    // debug(typeof vScore, vScore)
    switch (vScore) {
      case "+1":
        // Check if reviewed with +1
        const crScore = getCRScore(patch)
        if (crScore == 2) {
          return('VerifiedWith2')
        } else if (crScore == "+1") {
          return('VerifiedWith1')
        } else if (crScore == 0) {
          return('VerifiedWith0')
        } else if (crScore == -1) {
          return('VerifiedWithNeg1')
        } else if (crScore == -2) {
          return('VerifiedWithNeg2')
        } else {
          debug(`invalid crScore of ${crScore} for ${patch._number}`)
          return('INVALID')
        }
      case -1:
        return('NotVerified Verified-1')
      case -2:
        return('NotVerified Verified-2')
      case 0:
        return('NotVerified')
      case NO_DATA:
        return('NoVerificationData')
      default:
        debug(`getClass(${patch._number}): vScore (${vScore}) not recognized...`)
        return('NoVerificationData')
    }
  }
}

function processPatch(patch) {
  const vScore = getVScore(patch)
  const crScore = getCRScore(patch)
  let resp = ``
  const patchClass = getClass(patch)
  const reviewers = getCodeReviewers(patch)

  resp += `<tr class='${patchClass}'>
  <td><a href='${config.gerritUrlBase}/${patch._number}' target='_blank'>${patch._number}</a></td>
  <td>${vScore == NO_DATA ? "?" : vScore}</td>
  <td>${crScore == NO_DATA ? "?" : crScore}</td>
  <td>${patch.subject}</td>
  <td>${patch.owner.name}</td>
  <td>${patch.project}</td>
  <!-- td>${reviewers.length}</td -->
  <td>
  `
  if (crScore < 2) {
    // resp += `<ul class='list-group'><li class='list-group-item ${patchClass}'>Reviewers: ${getCodeReviewers(patch).join('; ')}</li></ul>`
    resp += reviewers.join(';').replaceAll(' ', '&nbsp;').replaceAll(');', '); ')
  }
  resp += `</td></tr>`
  
  pushRow(vScore, crScore, resp, patch.work_in_progress)
  // if (patch.work_in_progress) {
  //   reviewData.wip.push(resp)
  // } else {
  //   if (vScore == "+1") {
  //     switch (crScore) {
  //       case 1:
  //       case "+1":
  //         reviewData.cr1.push(resp)
  //         break;
  //       case 0:
  //         reviewData.cr0.push(resp)
  //         break;
  //       case 2:
  //         reviewData.cr2.push(resp)
  //         break;
  //       case -1:
  //         reviewData.crNeg1.push(resp)
  //         break;
  //       case -2:
  //         reviewData.crNeg2.push(resp)
  //         break;
  //       default:
  //         debug(`invalid crScore: ${crScore} for ${patch._number}`)
  //         break;
  //     }
  //   } else if (vScore == 0) { // not verified
  //     reviewData.ver0.push(resp)
  //   } else if (vScore == -1) { // not verified
  //     reviewData.verNeg1.push(resp)
  //   }
  // }
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
