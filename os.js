const { v4: uuidv4 } = require('uuid');
import { Subject } from "rxjs";
import { Ocean }  from '@questnetwork/quest-ocean-js';
import { BeeSwarmInstance }  from '@questnetwork/quest-bee-js';
import { UiService }  from '@questnetwork/qd-ui-js';
import { QuestSocial }  from '@questnetwork/quest-social-js';


import { ElectronService } from 'ngx-electron';
import { saveAs } from  'file-saver';

import { Utilities }  from './utilities/utilities.js';
import { ChannelManager }  from './channel/channelManager.js';
import { NativeCrypto }  from '../quest-crypto-js';


export class OperatingSystem {
    constructor() {
      let uVar;
      this.ocean = Ocean;
      this.channel = new ChannelManager();
      this.ready = false;
      this.utilities = new Utilities();
      this.isReadySub = new Subject();
      this.bee = new BeeSwarmInstance();
      this.crypto = new NativeCrypto();
      this.ui = new UiService();
      this.signedInSub = new Subject();
      this.social = new QuestSocial()
      this.signedIn = false;
      this.ipfsConfig = [];
      this.configCache = {};


      if(typeof navigator != 'undefined'){
        var userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.indexOf(' electron/') > -1) {
          this.isElectronFlag = true;
        }
        else{
          this.isElectronFlag = false;
        }
      }
      else{
        this.isNodeJS = true;
      }
      this.saveLockStatusSub = new Subject();

    }

    delay(t, val = "") {
       return new Promise(function(resolve) {
           setTimeout(function() {
               resolve(val);
           }, t);
       });
    }

    isSignedIn(){
      return this.isSignedIn();
    }
    hasConfigFile(){
      return this.bee.config.hasConfigFile();
    }
    hasLocalStorage(){
      try{
        let config = JSON.parse(window.localStorage.getItem('user-qcprofile'));
        if(typeof config == 'object' && typeof config['version'] != 'undefined'){
          return true;
        }
      }catch(e){console.log(e); return false;}
      return false;
    }


    async boot(config){
      if(typeof config['dependencies'] == 'undefined'){
        config['dependencies'] = {};
      }
      config['dependencies']['electronService'] = new ElectronService();
      config['dependencies']['saveAs'] = saveAs;

      this.configCache = config;
      if(typeof config['ipfs'] != 'undefined'){
        this.ipfsConfig = config['ipfs'];
      }

      try{
        config['ipfs'] = this.getIpfsConfig();
      }
      catch(e){console.log(e);}


      if(typeof config['boot'] == 'undefined' ||  typeof config['boot']['processes'] == 'undefined' || (typeof config['boot']['processes'] != 'undefined' && config['boot']['processes'].indexOf('ocean') > -1)){
        try{
          await this.ocean.create(config);
          config['dependencies']['dolphin'] = this.ocean.dolphin;
          this.ocean.dolphin.commitNowSub.subscribe( (value) => {
            this.bee.config.commitNow();
          });

          this.ocean.dolphin.commitSub.subscribe( (value) => {
            this.bee.config.commit();
          });
        }
        catch(e){
          console.log(e);
          if(e == 'Transport (WebRTCStar) could not listen on any available address'){
            throw(e);
          }
        }
      }

      if(typeof config['boot'] == 'undefined' || typeof config['boot']['processes'] == 'undefined' || (typeof config['boot']['processes'] != 'undefined' && config['boot']['processes'].indexOf('bee') > -1)){
          try{
            await this.bee.start(config);
            config['dependencies']['bee'] = this.bee;
            this.bee.config.saveLockStatusSub.subscribe( (value) => {
              if(value){
                this.enableSaveLock();
              }
              else{
                this.disableSaveLock();
              }
              this.saveLockStatusSub.next(value);

            });
          }catch(e){
            throw(e);
          }
      }

      if(typeof config['boot'] == 'undefined' ||  typeof config['boot']['processes'] == 'undefined' || (typeof config['boot']['processes'] != 'undefined' && config['boot']['processes'].indexOf('ocean') > -1 && config['boot']['processes'].indexOf('bee') > -1)){
        this.channel.load(config);
      }

      if(typeof config['boot'] == 'undefined' || typeof config['boot']['processes'] == 'undefined' || (typeof config['boot']['processes'] != 'undefined' && config['boot']['processes'].indexOf('qd-ui') > -1)){
          try{
            await this.ui.start(config);
          }catch(e){
            throw(e);
          }
      }


      if(typeof config['boot'] == 'undefined' || typeof config['boot']['processes'] == 'undefined' || (typeof config['boot']['processes'] != 'undefined' && config['boot']['processes'].indexOf('social') > -1)){
          try{
            await this.social.start(config);
          }catch(e){
            throw(e);
          }
      }


      this.ready = true;
      this.isReadySub.next(true);
      return true;
    }

    isReady(){
      return this.ready;
    }
    onReady(){
      return this.isReadySub;
    }
    reboot(){
      if(this.isElectron()){
        this.configCache['dependencies']['electronService'].remote.getCurrentWindow().close();
      }
      else{
        window.location.reload();
      }
    }

    isNodeJS(){
      return this.isNodeJS;
    }

    setIpfsConfig(ipfsConfig){
      console.log('OS: Setting Peers',ipfsConfig);
      if(this.isElectron()){
        let fs =   this.configCache['dependencies']['electronService'].remote.require('fs');
        let configPath =  this.configCache['dependencies']['electronService'].remote.app.getPath('userData');
        configPath = configPath + "/ipfs.config";
        try{
          fs.writeFileSync(configPath, JSON.stringify({ipfsConfig),{encoding:'utf8',flag:'w'})
        }catch(e){console.log(e);}
      }
      else if(this.isNodeJS()){
        let fs =  require('fs');
        let configPath = 'config';
        configPath = configPath + "/ipfs.config";
        try{
          fs.writeFileSync(configPath, JSON.stringify(ipfsConfig),{encoding:'utf8',flag:'w'})
        }catch(e){console.log(e);}
      }
       this.bee.config.setIpfsConfig(ipfsConfig);
    }
    getIpfsConfig(){
      //check swarm peer list
      if(this.isElectron()){
        try{
          let fs =   this.configCache['dependencies']['electronService'].remote.require('fs');
          let configPath = this.configCache['dependencies']['electronService'].remote.app.getPath('userData');
          configPath = configPath + "/ipfs.config";
          let fileIpfsConfig = fs.readFileSync(configPath).toString('utf8');
          console.log('OS:',fileIpfsConfig);
          let diskIpfsConfig;
          if(typeof fileIpfsConfig == 'string'){
            diskIpfsConfig = JSON.parse(fileIpfsConfig);
          }
          else{
            diskIpfsConfig = fileIpfsConfig;
          }
          this.bee.config.setIpfsConfig(diskIpfsConfig);
          return diskIpfsConfig;

        }catch(e){console.log(e);}
      }
      else if(this.isNodeJS()){
        try{
          let fs =  require('fs');
          let configPath = 'config'
          configPath = configPath + "/ipfs.config";
          let fileIpfsConfig = fs.readFileSync(configPath).toString('utf8');
          console.log('OS:',fileIpfsConfig);
          let diskIpfsConfig;
          if(typeof fileIpfsConfig == 'string'){
            diskIpfsConfig = JSON.parse(fileIpfsConfig);
          }
          else{
            diskIpfsConfig = fileIpfsConfig;
          }
          this.bee.config.setIpfsConfig(diskIpfsConfig]);
          return diskIpfsConfig;

        }catch(e){console.log(e);}
      }

      let ipfsConfig = this.ipfsConfig;
      //try to load from file
      let ipfsConfigAfterStart = this.bee.config.getIpfsConfig();
      console.log(ipfsConfigAfterStart);
      if(typeof ipfsConfigAfterStart != 'undefined' && ipfsConfigAfterStart.length > 0){
        ipfsConfig = ipfsConfigAfterStart;
      }
      //check additional peers added from loaded config data
      return ipfsConfig;
    }

    commit(){
      this.bee.config.commit();
    }
    commitNow(){
      this.bee.config.commitNow();
    }
    enableSaveLock(){
      this.bee.config.setSaveLock(true);
      // this.saveLockStatusSub.next(true);
    }
    disableSaveLock(){
      this.bee.config.setSaveLock(false);
      // this.saveLockStatusSub.next(false);
    }
    getSaveLock(){
      return this.bee.config.getSaveLock();
    }
    saveLockStatus(){
      return this.saveLockStatusSub;
    }

    enableAutoSave(){
      this.bee.config.setAutoSave(true);
      // this.saveLockStatusSub.next(true);
    }
    disableAutoSave(){
      this.bee.config.setAutoSave(false);
      // this.saveLockStatusSub.next(false);
    }
    getAutoSave(){
      return this.bee.config.getAutoSave();
    }
    getAutoSaveInterval(){
      return this.bee.config.getAutoSaveInterval();
    }
    setAutoSaveInterval(v){
       this.bee.config.setAutoSaveInterval(v);
    }
    autoSaveStatus(){
      return this.saveLockStatusSub;
    }



    signIn(config = {}){
      this.bee.config.readConfig(config);
      this.signedIn = true;
      this.signedInSub.next(true);
    }
    signOut(){
      try{
        this.bee.config.deleteConfig();
      }
      catch(e){}

      this.signedIn = false;
      if(this.isElectron()){
      let a = this.bee.config.electron.remote.getCurrentWindow();
      a.close();
      }
      else{
        let locArr = window.location.href.split('/');
        locArr.pop();
        window.location.href = locArr.join('/');
      }

    }
    onSignIn(){
      return this.signedInSub;
    }
    isSignedIn(){
      return this.signedIn;
    }
    exportConfig(){
      this.bee.config.commitNow({ export: true });
    }

    isElectron(){
      return this.isElectronFlag;
    }


    setStorageLocation(v){
      console.log(v);
      this.bee.config.setStorageLocation(v);
    }
    getStorageLocation(){
      return this.bee.config.getStorageLocation();
    }



  }
