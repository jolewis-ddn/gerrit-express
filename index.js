const path = require('path')

const fetch = require('node-fetch')
const debug = require('debug')('index')
const fs = require('fs')
const config = require('config')

let webhook = false
if (config.has('slackWebhookUrl')) {
  const { IncomingWebhook } = require('@slack/webhook')
  webhook = new IncomingWebhook(config.slackWebhookUrl)
}

const NodeCache = require('node-cache')
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 })

const express = require('express')
const { Promise } = require('node-fetch')

const app = express()
const port = config.has('port') ? config.get('port') : 3000 // HTTP port

const NO_DATA = -999 // Indicates that data is missing or invalid

/**
 * Return the HTML footer, including Bootstrap CSS & custom styles
 *
 * @param {string} [title="Gerrit Report"] Page title
 * @returns {string} HTML
 */
function getHtmlHead(title = 'Gerrit Report', printLegend = true) {
  return `<!doctype html>
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
    ${
      printLegend
        ? `<table class="sticky-top start-100" style="border-color:white; border-style:solid;" border=3>
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
    </table>`
        : ``
    }
    <h1>${title}</h1>
    `
}

/**
 * Return the HTML footer, including Bootstrap JS
 *
 * @returns {string} HTML
 */
function getHtmlFoot() {
  return `<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta1/dist/js/bootstrap.bundle.min.js" integrity="sha384-ygbV9kiqUc6oa4msXn9868pTtWMgiQaeYH7/t7LECLbyPA2x65Kgf80OJFdroafW" crossorigin="anonymous"></script></body></html>`
}

let reviewData = resetReviewData()

/**
 * Append data to the reviewData object
 *
 * @param {number} vScore Verified score
 * @param {number} crScore Code Review score
 * @param {string} row HTML content
 * @param {boolean} [isWip=false] If work_in_progress=true
 */
function pushRow(vScore, crScore, row, isWip = false) {
  if (isWip) {
    reviewData.wip.push(row)
  } else {
    reviewData.nonWip[convertVScoreToIndex(vScore)][
      convertCRScoreToIndex(crScore)
    ].push(row)
  }
}

/**
 * Return CR score based on array index in reviewData object
 *
 * @param {number} index Index of corresponding data
 * @returns {string|number} Number or string from Gerrit
 */
function convertVIndexToScore(index) {
  switch (index) {
    case 0:
      return -1
    case 1:
      return 0
    case 2:
      return '+1'
    case 3:
    default:
      return '?'
  }
}

/**
 * Index in reviewData object for specified Verified score value
 *
 * @param {number} score Number or string from Gerrit
 * @returns {number} Index of corresponding data
 */
function convertVScoreToIndex(score) {
  switch (score) {
    case -1:
      return 0
    case 0:
      return 1
    case 1:
    case '+1':
      return 2
    default:
      debug(`convertVScoreToIndex(${score})... unrecognized VScore value!`)
      return 3
  }
}

/**
 * Return CR score based on array index in reviewData object
 *
 * @param {number} index Index of corresponding data
 * @returns {string|number} Number or string from Gerrit
 */
function convertCRIndexToScore(index) {
  switch (index) {
    case 0:
      return -2
    case 1:
      return -1
    case 2:
      return 0
    case 3:
      return '+1'
    case 4:
      return '+2'
    case 5:
    default:
      return '?'
  }
}

/**
 * Index in reviewData object for specified Verified score value
 *
 * @param {number} score Number or string from Gerrit
 * @returns {number} Index of corresponding data
 */
function convertCRScoreToIndex(score) {
  switch (score) {
    case -2:
      return 0
    case -1:
      return 1
    case 0:
      return 2
    case 1:
    case '+1':
      return 3
    case 2:
    case '+2':
      return 4
    default:
      debug(`convertCRScoreToIndex(${score})... unrecognized CR score value!`)
      return 5
  }
}

/* Data Structure (n.b. X is unknown/invalid)
  Ver:
  +1:      cr-2, cr-1, cr0, cr1, cr2, crX
   0:      cr-2, cr-1, cr0, cr1, cr2, crX
  -1:      cr-2, cr-1, cr0, cr1, cr2, crX
  Invalid: cr-2, cr-1, cr0, cr1, cr2, crX
 */

/**
 * Empty reviewData structure
 *
 * @returns {object} Properly formatted data structure
 */
function resetReviewData() {
  return {
    wip: [],
    nonWip: [
      [[], [], [], [], [], []], // -1
      [[], [], [], [], [], []], // 0
      [[], [], [], [], [], []], // +1
      [[], [], [], [], [], []], // Invalid
    ],
  }
}

function processData(data) {
  if (data && !cache.has('reportData')) {
    reviewData = resetReviewData()
    data.forEach((patch) => {
      processPatch(patch)
    })
    cache.set('reportData', formatPatchData())
    cache.set('reportDate', new Date())
    cache.set('reviewData', reviewData)
  }
  return cache.has('reportData')
}

/**
 * Return the (cached) report data,
 * rebuilding if necessary (e.g. cache has expired or first run)
 * using the supplied data from Gerrit
 *
 * @param {string} data Source data from Gerrit
 * @returns {string} HTML for output
 */
async function getReport(data) {
  return new Promise(async (resolve, reject) => {
    if (data && !cache.has('reportData')) {
      if (!processData(data)) {
        console.error(`getReport(data) failed...`)
      } else {
        // Send Slack message?
        if (config.has('slackWebhookUrl')) {
          let header = `\n\` V CR> -2 | -1 |  0 | +1 | +2 |  ? |\``
          let slackMsg = [header]
          Array(reviewData.nonWip.length)
            .fill(0)
            .forEach((x, vi) => {
              let viScore = convertVIndexToScore(vi)
              if (viScore == 0 || viScore == '?') { viScore = ` ${viScore}`}
              let msg = `${viScore} -->`
              Array(reviewData.nonWip[0].length)
                .fill(0)
                .forEach((y, cri) => {
                  let len = reviewData.nonWip[vi][cri].length
                  if (len < 10) { len = ' ' + len }
                  msg += ` ${len} |`
                })
                slackMsg.push(`\`${msg}\``)
            })
          slackMsg.push(`... not counting ${reviewData.wip.length} WIP patches`)
          await webhook.send({ type: "mrkdwn", text: `*getAndSaveOpenData* @ ${cache.get('reportDate')}: ${slackMsg.join(`\n`)}` })
        }
      }
    }
    resolve(cache.get('reportData'))
  })
}

/**
 * Create string of HTML from reviewData
 *
 * @returns {string} HTML string
 */
function formatPatchData() {
  return reviewData.nonWip[convertVScoreToIndex(+1)][convertCRScoreToIndex(2)]
    .concat(
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
      reviewData.nonWip[convertVScoreToIndex(-1)][convertCRScoreToIndex(-2)],
      reviewData.nonWip[convertVScoreToIndex(NO_DATA)][
        convertCRScoreToIndex(2)
      ],
      reviewData.nonWip[convertVScoreToIndex(NO_DATA)][
        convertCRScoreToIndex(1)
      ],
      reviewData.nonWip[convertVScoreToIndex(NO_DATA)][
        convertCRScoreToIndex(0)
      ],
      reviewData.nonWip[convertVScoreToIndex(NO_DATA)][
        convertCRScoreToIndex(-1)
      ],
      reviewData.nonWip[convertVScoreToIndex(NO_DATA)][
        convertCRScoreToIndex(-2)
      ],
      reviewData.nonWip[convertVScoreToIndex(NO_DATA)][
        convertCRScoreToIndex(NO_DATA)
      ]
    )
    .join('')
}

/**
 * Calculate the summary Verified score for the supplied patch
 *
 * @param {object} patch JSON patch data from Gerrit
 * @returns {string|number} Value - return "+1" if Max is 1, otherwise Min
 */
function getVScore(patch) {
  let vScore = NO_DATA
  if (patch.labels.Verified && patch.labels.Verified.all) {
    vScore = patch.labels.Verified.all.map((x) => (x.value ? x.value : 0))

    vScoresMax = vScore.reduce((max, cur) => Math.max(max, cur))
    vScoresMin = vScore.reduce((min, cur) => Math.min(min, cur))

    if (vScoresMax == 1) {
      vScore = '+1'
    } else if (vScoresMin == -1) {
      return -1
    } else {
      return 0
    }
  }
  return vScore
}

/**
 * Calculate the summary CR score for the supplied patch
 *
 * @param {object} patch JSON patch data from Gerrit
 * @returns {string|number} Value - return Max if no negative values,
 *                           otherwise return Min
 */
function getCRScore(patch) {
  let crScore = NO_DATA
  if (patch.labels['Code-Review'] && patch.labels['Code-Review'].all) {
    crScores = patch.labels['Code-Review'].all.map((el) => el.value)

    crScoresMax = crScores.reduce((max, cur) => Math.max(max, cur))
    crScoresMin = crScores.reduce((min, cur) => Math.min(min, cur))

    if (crScoresMax == 2 && crScoresMin == 0) {
      crScore = '+2'
    } else if (crScoresMax == 1 && crScoresMin == 0) {
      crScore = '+1'
    } else {
      crScore = crScoresMin
    }
  }
  return crScore
}

/**
 * Determine the right CSS class for the supplied patch
 * Based on work_in_progress, Verified score, and Code-Review score
 * (or 'NoVerificationData' on invalid/missing data)
 *
 * @param {object} patch JSON patch data from Gerrit
 * @returns {string} CSS class name
 */
function getClass(patch) {
  if (patch.work_in_progress) {
    return 'WIP'
  } else {
    const vScore = getVScore(patch)
    switch (vScore) {
      case '+1':
        const crScore = getCRScore(patch)
        if (crScore == 2) {
          return 'VerifiedWith2'
        } else if (crScore == '+1') {
          return 'VerifiedWith1'
        } else if (crScore == 0) {
          return 'VerifiedWith0'
        } else if (crScore == -1) {
          return 'VerifiedWithNeg1'
        } else if (crScore == -2) {
          return 'VerifiedWithNeg2'
        } else {
          debug(`invalid crScore of ${crScore} for ${patch._number}`)
          return 'INVALID'
        }
      case -1:
        return 'NotVerified Verified-1'
      case -2:
        return 'NotVerified Verified-2'
      case 0:
        return 'NotVerified'
      case NO_DATA:
        return 'NoVerificationData'
      default:
        console.error(
          `getClass(${patch._number}): vScore (${vScore}) not recognized...`
        )
        return 'NoVerificationData'
    }
  }
}

/**
 * Build the HTML content for the supplied patch
 *
 * @param {object} patch JSON patch data from Gerrit
 * @returns {boolean} True on success
 */
function processPatch(patch) {
  const vScore = getVScore(patch)
  const crScore = getCRScore(patch)
  const patchClass = getClass(patch)
  const reviewers = getCodeReviewers(patch)

  // HTML table row containing the content for display

  pushRow(
    vScore,
    crScore,
    buildRowHtml(
      patch._number,
      vScore,
      crScore,
      patchClass,
      reviewers,
      patch.subject,
      patch.owner.name,
      patch.project
    ),
    patch.work_in_progress
  )
  return true
}

/**
 * Create the HTML table row string from the patch data
 *
 * @param {number} patchNumber Patch number
 * @param {string|number} vScore Verified score
 * @param {string|number} crScore Code-Review score
 * @param {string} patchClass CSS class name
 * @param {string} reviewers List of reviewers (HTML)
 * @param {string} subject Subject
 * @param {string} owner Owner name
 * @param {string} project Project name
 * @returns {string} HTML TR
 */
function buildRowHtml(
  patchNumber,
  vScore,
  crScore,
  patchClass,
  reviewers,
  subject,
  owner,
  project
) {
  let reviewerCell =
    crScore < 2
      ? // If the patch doesn't have a Code Review +2 yet, add the reviewers
        reviewers.join(';').replaceAll(' ', '&nbsp;').replaceAll(');', '); ')
      : ''

  return `<tr class='${patchClass}'>
  <td><a href='${
    config.gerritUrlBase
  }/${patchNumber}' target='_blank'>${patchNumber}</a></td>
  <td>${vScore == NO_DATA ? '?' : vScore}</td>
  <td>${crScore == NO_DATA ? '?' : crScore}</td>
  <td>${subject}</td>
  <td>${owner}</td>
  <td>${project}</td>
  <td>${reviewerCell}</td>
  </tr>`
}

/**
 * Get a list of reviewers from the Gerrit data for the supplied patch
 *
 * @param {*} patch JSON object from Gerrit with full patch data
 * @returns {array} List of reviewers' names (excluding Jenkins)
 */
function getCodeReviewers(patch) {
  const reviewers = []
  if (patch.labels['Code-Review'] && patch.labels['Code-Review'].all) {
    patch.labels['Code-Review'].all.forEach((r) => {
      if (r.name !== 'jenkins') {
        reviewers.push(r.name + '(' + (r.value == '1' ? '+1' : r.value) + ')')
      }
    })
  }
  return reviewers
}

/**
 * Fetch the Gerrit data or return the cached data
 *
 * @param {boolean} [forceRefresh=false] Require a new data load
 * @returns {string} JSON data from Gerrit (cached)
 */
async function getAndSaveOpenData(forceRefresh = false) {
  return new Promise(async (resolve, reject) => {
    if (!cache.has(`openData`) || forceRefresh) {
      debug('fetching data: forceRefresh: ', forceRefresh)
      getGerritData(config.openQuery).then((data) => {
        if (!fs.existsSync(config.dataDir)) {
          fs.mkdirSync(config.dataDir)
        }

        fs.writeFileSync(
          config.dataDir + path.sep + config.dataFileName + config.dataFileExt,
          JSON.stringify(data)
        )
        if (config.has('saveHistory') && config.saveHistory) {
          let historyDir = config.has('historyDir')
            ? config.historyDir
            : config.dataDir

            if (!fs.existsSync(historyDir)) {
              fs.mkdirSync(historyDir)
            }

          debug(`...saving archive file to ${historyDir}`)

          fs.writeFileSync(
            historyDir +
              path.sep +
              config.dataFileName +
              '-' +
              Date.now() +
              config.dataFileExt,
            JSON.stringify(data)
          )
        }
        cache.set(`openData`, data)
        resolve(data)
      })
    } else {
      debug('returning cached data')
      resolve(cache.get(`openData`))
    }
  })
}

/**
 * Fetch the raw data from Gerrit
 *
 * @param {string} query Gerrit query string (e.g. 'is:open')
 * @returns {string} Cleaned JSON
 */
async function getGerritData(query) {
  const response = await fetch(
    config.gerritUrlBase +
      config.gerritUrlPrefix +
      query +
      config.gerritUrlSuffix
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

app.get('/', async (req, res) => {
  getAndSaveOpenData().then(async (data) => {
    const report = await getReport(data)

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.write(getHtmlHead())
    res.write(`<em>Data cached at: ${cache.get('reportDate')}`)
    res.write(`<table class="table">
      <thead>
      <tr>
      <th scope="col">#</th>
      <th scope="col">V</th>
      <th scope="col">CR</th>
      <th scope="col">Subject</th>
      <th scope="col">Owner</th>
      <th scope="col">Project</th>
      <th scope="col">Reviewers</th>
      </tr>
      </thead><tbody>`)
    res.write(report)
    res.write('</tbody></table>')
    res.write(getHtmlFoot())
    res.end()
  })
})

app.get('/stats', async (req, res) => {
  getAndSaveOpenData().then(async (data) => {
    const report = await getReport(data)
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.write(getHtmlHead('Stats', false))
    res.write(`<h2>Distribution</h2><em>Ignoring WIP</em>`)
    // Print stats table
    res.write(`<table class="table"><thead>
    <tr><th></th>`)
    Array(reviewData.nonWip[0].length)
      .fill(0)
      .forEach((y, cri) => {
        debug(`convertCRIndexToScore(${cri}) about to be called...`)
        res.write(`<th scope="col">CR ${convertCRIndexToScore(cri)}</th>`)
      })
    res.write(`</tr></thead><tbody><tr>`)
    Array(reviewData.nonWip.length)
      .fill(0)
      .forEach((x, vi) => {
        res.write(`<th scope="row">V ${convertVIndexToScore(vi)}</th>`)
        Array(reviewData.nonWip[0].length)
          .fill(0)
          .forEach((y, cri) => {
            res.write(
              `<td><!-- v: ${vi}; cr: ${cri} -->${reviewData.nonWip[vi][cri].length}</td>`
            )
          })
        res.write(`</tr>`)
      })
    res.write('</tbody></table>')
    res.write(`<h2>WIP</h2>${reviewData.wip.length} WIP patches`)
    res.write(getHtmlFoot())
    res.end()
  })
})

app.listen(port, () => {
  console.log(`App listening at port ${port}`)
})
