'use strict'

const downloadFileFromGithub = require('./download-file-from-github')
const electronInstaller = require('electron-winstaller')
const fs = require('fs-extra')
const glob = require('glob')
const os = require('os')
const path = require('path')
const spawnSync = require('./spawn-sync')

const CONFIG = require('../config')

module.exports = function (packagedAppPath, codeSign) {
  const options = {
    appDirectory: packagedAppPath,
    authors: 'GitHub Inc.',
    iconUrl: `https://raw.githubusercontent.com/atom/atom/master/resources/app-icons/${CONFIG.channel}/atom.ico`,
    loadingGif: path.join(CONFIG.repositoryRootPath, 'resources', 'win', 'loading.gif'),
    outputDirectory: CONFIG.buildOutputPath,
    remoteReleases: `https://atom.io/api/updates?version=${CONFIG.appMetadata.version}`,
    setupIcon: path.join(CONFIG.repositoryRootPath, 'resources', 'app-icons', CONFIG.channel, 'atom.ico')
  }

  const certPath = path.join(os.tmpdir(), 'win.p12')
  const signing = codeSign && process.env.WIN_P12KEY_URL
  if (signing) {
    downloadFileFromGithub(process.env.WIN_P12KEY_URL, certPath)
    options.certificateFile = certPath
    options.certificatePassword = process.env.WIN_P12KEY_PASSWORD
  } else {
    console.log('Skipping code-signing. Specify the --code-sign option and provide a WIN_P12KEY_URL environment variable to perform code-signing'.gray)
  }

  const cleanUp = function () {
    if (fs.existsSync(certPath)) {
      console.log(`Deleting certificate at ${certPath}`)
      fs.removeSync(certPath)
    }

    for (let nupkgPath of glob.sync(`${CONFIG.buildOutputPath}/*.nupkg`)) {
      if (!nupkgPath.includes(CONFIG.appMetadata.version)) {
        console.log(`Deleting downloaded nupkg for previous version at ${nupkgPath} to prevent it from being stored as an artifact`)
        fs.removeSync(nupkgPath)
      }
    }
  }

  // Squirrel signs its own copy of the executables but we need them for the portable ZIP
  const extractSignedExes = function() {
    if (signing) {
      for (let nupkgPath of glob.sync(`${CONFIG.buildOutputPath}/*-full.nupkg`)) {
        if (nupkgPath.includes(CONFIG.appMetadata.version)) {
          console.log(`Extracting signed executables from ${nupkgPath} for use in portable zip`)
          var atomOutPath = path.join(path.dirname(packagedAppPath), 'Atom')
          spawnSync('7z.exe', ['e', nupkgPath, 'lib\\net45\\*.exe', '-o${atomOutPath}', '-aoa'], {cwd: atomOutPath})
          spawnSync(process.env.COMSPEC, ['/c', `move /y ${path.join(atomOutPath, 'squirrel.exe')} ${path.join(atomOutPath, 'update.exe')}`])
          return
        }
      }
    }
  }

  console.log(`Creating Windows Installer for ${packagedAppPath}`)
  return electronInstaller.createWindowsInstaller(options)
    .then(extractSignedExes, function (error) {
      console.log(`Extracting signed executables failed:\n${error}`)
      cleanUp()
    })
    .then(cleanUp, function (error) {
      console.log(`Windows installer creation failed:\n${error}`)
      cleanUp()
    })
}
