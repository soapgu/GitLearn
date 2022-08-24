//just add a commit
var express = require('express');
var router = express.Router();
var M = require('../models/meeting');
var C = require('../models/case');
var formidable = require('../utils/formidableUpload');
var filesize = require('filesize');
var Member = require('../models/attendees');
var client = requestClient.createClient('http://'+config.serverIp+':'+config.meetingPort);
var clientFile = requestClient.createClient('http://'+config.serverIp+':'+config.filePort);
var clientOpinion = requestClient.createClient('http://'+config.serverIp+':'+config.opinionPort);
var clientCase = requestClient.createClient('http://'+config.serverIp+':'+config.casePort);
var checkinClient = requestClient.createClient('http://'+config.serverIp+':'+config.checkinPort);
var memberClient = requestClient.createClient('http://'+config.serverIp+':'+config.attendeesPort);
var clientVote = requestClient.createClient('http://'+config.serverIp+':'+config.votePort);
var eventClient = requestClient.createClient('http://'+config.serverIp+':'+config.eventPort);

router.all('*', checkLogin);

function checkLogin(req, res, next) {
//2017-06-20 zf start
//    if (!req.session.user){
//        res.redirect('/login')
//    } else {
//        console.log(req.url)
//        next();
//    }
    //console.log('meeting....role:',req.session.user.role)
    if(req.session.user.role != "admin"){
        res.redirect('/login')
    }
    else{
        next();
    }
    //if(req.session.user.role == "admin" || req.session.user.role == "user" ){
//
//        next();
//    }
//    else{
//        res.redirect('/login')
//    }
//    if((req.session.user.role != "admin") || (req.session.user.role != "user")){
//        console.log('meeting not admin.....')
//        res.redirect('/login')
//    }
//    else{
//        console.log('meeting admin....')
//        next();
//    }
//2017-06-20 zf end
}

router.get('/secretary', function(req, res) {
    //console.log('/secretary .....')
  client.get('/v1/meeting', function(err, resp, meetings) {
    if (err || !resp.statusCode) {
      logger.info("获取会议信息错误:"+err);
      return res.status(404).render('error',{
        message: "404 NOT FOUND",
        error:{stack:'获取会议数据失败，请返回重试'},
        user:req.session.user
      });
    }
    if(meetings){
      meetings = meetings.sort(function(a,b){
        return (new Date(b.starttime)).getTime() - (new Date(a.starttime)).getTime();
      });
      var meetingGroup = _.groupBy(meetings, function(item){ return item.status; });
      meetings = _.union(meetingGroup.inprogress,meetingGroup.waiting,meetingGroup.finish);
    }
    //2017-06-20 zf start
    var pwd = req.session.user.password
    if(pwd === 'admin'){
        var newArr = meetings.filter(function(item){
            return item.reporter === "0";
        });
        return res.render('meeting/secretary', {
            meetings: newArr || [],
            user: req.session.user
        });
    }
    else if(pwd === 'user'){
        var newArr = meetings.filter(function(item){
            return item.reporter === "1";
        });
        return res.render('meeting/secretary', {
            meetings: newArr || [],
            user: req.session.user
        });
    }

//    return res.render('meeting/secretary', {
//      meetings: meetings || [],
//      user: req.session.user
//    });
      //2017-06-20 zf end
  });
});

router.get('/json',function (req, res) {
  if(req.query.id){
    res.send(M.getMeeting(req.query.id))
  }else{
    res.send(false)
  }
});

router.get('/committee', function(req, res) {
  client.get('/v1/meeting', function(err, resp, meetings) {
    if (err || !resp) {
      logger.info("meetingServer连接失败:"+err);
      return res.status(404).render('error',{
        message: "404 NOT FOUND",
        error:{stack:'获取会议数据失败，联系系统管理员'},
        user:req.session.user
      });
    }
    if (meetings) {
      meetings = _.reject(meetings,function(item){ return item.id == 'law' || item.id == 'background'});
      meetings = meetings.sort(function(a,b){
        return (new Date(b.starttime)).getTime() < (new Date(a.starttime)).getTime();
      });
      clientOpinion.get('/v1/opinion?memberid='+req.session.user.id, function(err, resp, opinions){
        if(err || !resp){
          logger.info("opinionServer连接失败:"+err);
          return res.status(404).render('error',{
            message: "404 NOT FOUND",
            error:{stack:'获取意见数据失败，联系系统管理员'},
            user:req.session.user
          });
        }
        var opinionCount = [];
        //meetings.forEach(function(item){
        //  var ids = _.pluck(item.source,'id');
        //  opinions.forEach(function(each){
        //    if(ids.indexOf(item.sourceid) > -1){
        //      console.log(1);
        //    }
        //  });
        //  console.log(each);
        //
        //});
        res.render('meeting/committee', {
          meetings: meetings,
          user: req.session.user
        });
      });
    }else{
      res.render('meeting/committee', {
        meetings: meetings || [],
        user: req.session.user
      });
    }
  })
});

router.get('/detail', function(req, res) {
  var mid = req.query.id;
  client.get('/v1/meeting/' + mid, function (err, resp, meeting) {
    if (err || !resp) {
      logger.info("meetingServer连接不上:" + err);
      return res.status(404).render('error', {
        message: "404 NOT FOUND",
        error: {stack: '获取会议信息失败，请联系统管理员重试'},
        user: req.session.user
      });
    }
    var agenda = [], s;
    (meeting.agenda || []).forEach(function (item) {
      var a = {
        id: item.id,
        name: item.name,
        starttime: item.starttime,
        endtime: item.endtime,
        source: [],
        //vote: item.vote,
        index: item.index,
        reporter: item.reporter
      };
      item.source.forEach(function (each) {
        s = _.find(meeting.source, function (s) {
          return s.id == each;
        });
        a.source.push(s);
      });
      agenda.push(a);
    });
    return res.render('meeting/detail', {
      meeting: meeting,
      agenda: agenda,
      ip: config.serverIp,
      port: config.nginxPort,
      nginxDownload: config.nginxDownload,
      user: req.session.user
    });
  });
});

router.get('/checkinresult',function(req, res){
  var mid = req.query.id;
  client.get('/v1/meeting/'+mid, function(err, resp, meeting) {
    if (err || !resp) {
      logger.info("获取会议信息错误:" + err);
      return res.status(404).render('error', {
        message: "404 NOT FOUND",
        error: {stack: '获取会议数据失败，请返回重试'},
        user: req.session.user
      });
    }
    checkinClient.get('/v1/checkinlist/'+mid, function(err, resp, checkin) {
      if (err || !resp) {
        logger.info("checkinServer连接不上:" + err);
        return res.status(404).render('error', {
          message: "404 NOT FOUND",
          error: {stack: '获取签到数据失败，请联系系统管理员'},
          user: req.session.user
        });
      }
      var ids = _.pluck(checkin.list, 'memberid');
      var notCheckin = _.reject(meeting.member,function(item){return JSON.stringify(ids).indexOf(item.id)>-1;});
      return res.render('meeting/checkinPrint', {
        meeting: meeting,
        checkin: checkin.list,
        notCheckin: notCheckin
      });
    });
  })

});

router.get('/', function(req, res, next) {
  var tab = req.query.tab;
  client.get('/v1/meeting', function(err, resp, meetings) {
    if (err) {
      logger.info("读取会议信息错误:"+err);
      return res.status(500).json({"error":"读取会议信息错误"});
    }
    if(meetings){
      meetings = meetings.sort(function(a,b){
        return a.starttime < b.starttime;
      });
      if(req.session.user.role == 'attendees'){
        meetings = _.filter(meetings, function(item){
          if (_.find(item.member, function(each){ return each.id == req.session.user.id;})){
            return true;
          }else{
            return false;
          }
        })
      }
    }
    client.get('/v1/current', function(err, resp, current) {
      if (err) {
        logger.info("错误" + err);
        return res.status(500).json({"error": err});
      }
      var m = JSON.stringify(current);
      res.render('meeting', {
        models: meetings || [],
        model: current || [],
        m: m,
        tab: tab,
        agendas: current.agenda || [],
        devices:[],
        user: req.session.user
      });
    });
  });
});

router.get('/create', function(req, res, next) {
  var mid = req.query.meetingid;
  if (mid){
    var m = M.getMeeting(mid);
    if(m){
      return res.render('meeting/create', {meeting: m, type: "1", user: req.session.user});
    } else {
      return res.render('meeting/create', {type: "0", user: req.session.user});
    }
  }else{
    return res.render('meeting/create',{type: "0", user: req.session.user});
  }
});

//缓存编辑会议
router.post('/load', function(req, res) {
  var mid = req.body.mid;
  client.get('/v1/meeting/'+mid, function(err, resp, meeting){
    if (err) {
      logger.info("读取会议信息错误:"+err);
      return res.status(500).render('error', {
        message: "读取会议信息错误",
        error: err
      });
    }
    M.load(meeting);
    res.json(200);
  });
});

router.get('/edit', function(req, res, next) {
  var mid = req.query.meetingid;
  var m = M.getMeeting(mid);
  if (!m) {
    return res.status(404).render('error', {
      message: "会议不存在",
      error: {stack: '请返回重试'}
    });
  }

  res.render('meeting/edit', {
    model: m,
    mid: mid,
    user: req.session.user
  });
});

router.post('/create', function(req, res, next) {
  var id = req.body.id;
  if (!id){
    id = M.builder(req.body);
  } else {
    M.modify(id, req.body);
  }
  memberClient.get('/v1/member',function(err, resp, members){
    if (err || !resp) {
      logger.error("memberServer连接不上:"+err);
      return res.json({code:404});
    }
    members = _.filter(members,function(item){return item.role == '委员'});
    if (M.getMeeting(id).member.length == 0){
      members.forEach(function(item){
        M.insertMember(id,item);
      });
    }
    logger.info(util.format("缓存成功：%s",req.body.name));
    res.json({code:200,id:id});
  });
});

//复制会议
router.post('/copy',function(req,res,next){
  var mid = req.body.mid;
  var newid = uuid.v4();
  var data = {sourceid:mid,targetid:newid};
  var funcs = [
    function(cb){
      client.get('/v1/meeting/'+mid, function(err, resp, meeting){
        if (err) {
          logger.info("读取会议信息错误:"+err);
          return cb({code:500,error:"读取会议信息错误"});
        }
        return cb(null,meeting);
      });
    },
    function(meeting,cb){
      meeting.id = newid;
      //meeting.status = 'waiting';
      //meeting.agenda.forEach(function(item){
      //  item.vote.status = 0;
      //  item.vote.result = 0;
      //  item.vote.tickets = null;
      //  return 0;
      //});
      client.post('/v1/meeting', meeting, function(err,resp,result){
        if (!resp) {
          logger.info("会议服务器连接不上");
          return cb({code:404,error:"会议服务器连接不上"});
        }
        if(resp.statusCode==200){
          logger.info("复制会议并提交信息");
          return cb(null);
        }else {
          logger.error("复制会议提交信息报错");
          return cb({code:resp.statusCode,error:"复制会议提交信息报错"});
        }
      });
    },
    function(cb){
      //拷贝文件
      clientFile.post('/file/meeting/copy',data,function(req,resp,result){
        if (!resp) {
          logger.info("文件服务器连接不上");
          return cb({code:404,error:"文件服务器连接不上"});
        }
        if(resp.statusCode==200){
          logger.info("拷贝文件成功");
          return cb(null);
        }else{
          logger.error("拷贝文件失败");
          return cb({code:500,error:"拷贝文件失败"});
        }
      });
    }
  ];
  async.waterfall(funcs,function(err,result){
    if(err){
      logger.error("复制会议报错");
      return res.json(err);
    }
    return res.json({code:200});
  });
});

//获取是否存在已开始会议
router.get('/isExistStart', function(req, res) {
  var url="/v1/meeting";
  client.get(url,function(err,resp,result){
    if (err) {
      logger.info("读取会议信息错误:" + err);
      return res.status(500).json({"error": "读取会议信息错误"});
    }
    for (var i in result) {
      if (result[i].status == 'inprogress') {
        return res.json(202)
      }
    }
    res.json(200);
  });
});

//会议状态控制(终端控制会议)
router.patch('/:mid',function(req,res) {
  var mid = req.params.mid;
  var status = req.body.status;
  if (!mid) {
    return res.status(404).json(404);
  }
  if (status == 'inprogress'){
    client.post('/v1/current', {id: mid}, function(err, resp, result){
      if (!resp) {
        logger.info("会议服务器连接不上");
        return res.json({code:404});
      }
      if(resp.statusCode == 309){
        return res.json({code:309,id:result.id});
      }
      return res.json({code:resp.statusCode});
    });
  } else {
    var url = '/v1/current/' + mid;
    var funcs = [
      function(cb){
        client.del(url, function (err, resp, data) {
          if(!resp) cb(404);
          if(resp.statusCode==200){
            cb(null);
          }else{
            cb(resp.statusCode);
          }
        });
      },
      function(cb){
        var p = "/file/compression/"+mid;
        clientFile.post(p,{}, function(err, resp, result){
          if (!resp) {
            logger.info("文件服务器连接不上");
            return cb(404);
          }
          if(resp.statusCode == 200){
            cb(null);
          }else{
            cb(resp.statusCode);
          }
        });
      }
    ];
    async.waterfall(funcs,function(err,result){
      if(err){
        return res.json(err);
      }
      return res.json(200);
    });
  }
});

//删除单个非进行中的会议
router.delete('/:id',function(req,res) {
  var id = req.params.id;
  var funcs = [
    function(cb){
      var url="/v1/meeting/"+id;
      client.del(url,function(err,resp,result) {
        if(resp.statusCode==200){
          logger.info("删除会议数据：" + id);
          return cb(null);
        }else{
          logger.info("删除会议数据报错：" + id);
          return cb({code:resp.statusCode,error:"删除会议数据报错"});
        }
      });
    },
    // function(cb){
    //   clientVote.del('/v1/votemeeting/'+id, function(err, resp ,data) {
    //     if (!resp) {
    //       logger.info("合议服务器连接不上");
    //       return res.json({code:404});
    //     }
    //     if(resp.statusCode==200){
    //       cb(null);
    //     }else{
    //       cb(resp.statusCode);
    //     }
    //   });
    // },
    function(cb){
      var url="/file/meeting/"+id;
      clientFile.del(url,function(err,resp,result) {
        if(!resp){
          logger.error("fileService连接不上");
          return cb({code:404,error:"fileService连接不上"});
        }
        if(resp.statusCode==200){
          logger.info("删除远端会议文件：" + id);
          return cb(null);
        }else{
          logger.info("删除远端会议文件报错：" + resp.statusCode);
          return cb({code:resp.statusCode,error:"删除远端会议文件报错"});
        }
      });
    },
    function(cb){
      var mPath = path.join(dirPath, config.ftpPath, id);
      if (helper.isExist(mPath)) {
        helper.removeDirectory(mPath);
        logger.info("删除本地会议文件：" + id);
      } else {
        logger.info("本地会议文件不存在");
      }
      return cb(null);
    }
  ];
  async.waterfall(funcs,function(err,data){
    if(err){
      return res.json(err);
    }
    return res.json({code:200});
  });
});

router.delete('/cache/:id', function(req, res){
  var mid = req.params.id;
  M.removeMeeting(mid);
  var mPath = path.join(dirPath, config.ftpPath, mid);
  if (helper.isExist(mPath)) {
    helper.removeDirectory(mPath);
    logger.info("删除本地会议文件：" + mid);
  } else {
    logger.info("本地会议文件不存在");
  }
  logger.info("删除会议缓存："+mid);
  res.json(200);
});

//建会or编辑提交
router.post('/complete/:id', function(req, res) {
  var id = req.params.id;
  var m = M.getMeeting(id);
  m.agenda.forEach(function(item){item.endtime = '';});
  var funcs = [];
  if (req.body.type == 'post') {
    funcs.push(function (callback) {
      client.post('/v1/meeting', m, function (err, resp, data) {
        if (!resp) {
          logger.info("meetingServer无法连接");
          return callback(404);
        }
        if (resp.statusCode !== 200) {
          return callback(resp.statusCode);
        }
        logger.info("提交建会成功：" + m.name);
        M.removeMeeting(id);
        logger.info("删除会议缓存：" + m.name);
        callback(null);
      });
    })
  } else {
    funcs.push(function (callback) {
      client.put('/v1/meeting', m, function (err, resp, data) {
        if (!resp) {
          logger.info("meetingServer无法连接");
          return callback(404);
        }
        if (resp.statusCode !== 200) {
          return callback(resp.statusCode);
        }
        logger.info("put会议成功：" + m.name);
        M.removeMeeting(id);
        logger.info("删除会议缓存：" + m.name);
        callback(null);
      });
    })
  }
  m.agenda.forEach(function (item) {
    if (item.caseid && item.caseid != '') {
      funcs.push(function (callback) {
        clientFile.post('/file/meeting/copy', {sourceid:item.caseid,targetid:id}, function (err, resp, data) {
          if (!resp) {
            logger.info("fileService连接不上");
            return callback(404);
          }
          if (resp.statusCode !== 200) {
            logger.error("拷贝文件失败:"+item.caseid);
            callback(resp.statusCode);
          }
          logger.info("拷贝文件成功:"+item.caseid);
          callback(null);
        });
      })
    }
  });
  async.waterfall(funcs,function(err,data){
    if(err){
      return res.json(err);
    }
    res.json(200);
    var mPath = path.join(dirPath, config.ftpPath, m.id.toString());
    var files = helper.readDirectory(mPath);
    if(!files || files.length==0){
      setTimeout(function(){
        eventClient.post('/notify', {event: "fileconvert", params: {id: id}}, function(err, resp, data){})
      },5000);
    }
    for (var index in files) {
      var p = path.join(mPath, files[index]);
      helper.uploadFile(p, m.id, function optionalCallback(err, httpResponse, body) {
        if (err) {
          return logger.error('上传失败:', err);
        }
        logger.info('发送：', body);
        if(index == files.length-1){
          setTimeout(function(){
            eventClient.post('/notify', {event: "fileconvert", params: {id: id}}, function(err, resp, data){})
          },5000);
        }
      });
    }
  });
});

router.get('/download/:mid',function(req,res){
  var mid = req.params.mid;
  console.log('mid:',mid)
  clientFile.get('/file/zip/'+mid,function(err,resp,result){
    if(err){
      logger.error("获取zip文件服务器报错："+err.code);
      return res.status(404).render('error',{
        message: "404 NOT FOUND",
        error:{stack:'获取打包文件失败，请返回重试'},
        user:req.session.user
      });
    }
    return res.json({statusCode:resp.statusCode,ip:config.serverIp,port:config.nginxPort,nginxDownload:config.nginxDownload});
  });
});
/****************************agenda页面控制*************************/
router.get('/agenda', function(req,res){
  var mid = req.query.mid;
  var m = M.getMeeting(mid);
  if (!m){
    return res.redirect('/meeting/create');
  }else {
    m.agenda.forEach(function (item) {
      if (item.name == '') {
        item.source.forEach(function (s) {
          M.removeSource(mid, s.id)
        });
        m.agenda.splice(m.agenda.indexOf(item), 1);
      }
    });
    res.render('meeting/agenda', {
      mDate: m.starttime,
      m: m,
      user: req.session.user
    });
  }
});

router.get('/:mid/agenda/:aid', function(req,res) {
  var aid = req.params.aid;
  var mid = req.params.mid;
  var agenda = M.getAgendaById(mid, aid);
  return res.json({vote:agenda.vote});
});
//获取议题资料信息
router.get('/:mid/agenda/:aid/source', function(req,res) {
  var aid = req.params.aid;
  var mid = req.params.mid;
  var a = M.getAgendaById(mid, aid);
  var source = [];
  a.source.forEach(function(item){
    source.push(M.getSourceById(mid,item));
  });
  return res.json(source);
});
//提交议题
router.post('/:mid/agenda/:aid', function(req, res){
  var aid = req.params.aid;
  var mid = req.params.mid;
  var a = M.getAgendaById(mid,aid);
  a.name = req.body.name;
  a.reporter = req.body.reporter;
  a.starttime = req.body.starttime;
  a.endtime = req.body.endtime;
  logger.info("提交议程缓存："+req.body.name);
  res.sendStatus(200);
});

router.post('/:mid/agendaModel/:aid', function(req, res) {
  var mid = req.params.mid;
  var aid = req.params.aid;
  var a = M.getAgendaById(mid,aid);
  if (a && a.name =='') {
    M.removeAgenda(mid,aid);
  }
  var id = M.insertAgenda(mid,{});
  logger.info('创建agenda缓存成功：' + id);
  res.send(id);
});

//添加案件议题
router.post('/:mid/agenda/:aid/case/:cid', function(req, res) {
  var mid = req.params.mid;
  var aid = req.params.aid;
  var cid = req.params.cid;
  clientCase.get('/v1/courtcase/'+cid, function(err, resp, item){
    if (err || !resp.statusCode) {
      logger.info("获取案件数据失败:"+err);
      return res.status(404).render('error',{
        message: "404 NOT FOUND",
        error:{stack:'获取案件数据失败，请返回重试'},
        user:req.session.user
      });
    }
    M.caseToAgenda(item, req.body.name, mid, aid);
    logger.info("添加案件议程缓存："+ item.no);
    res.sendStatus(200);
  });

});

//议题顺序
router.post('/agendaMoving', function(req, res) {
  var m = M.getMeeting(req.body.mid);
  var broId;
  for (var i in m.agenda){
    if(m.agenda[i].id == req.body.aid){
      var temp = _.clone(m.agenda[i]);
      if(req.body.move == '0'){
        if(m.agenda[i-1]){
          broId = _.clone(m.agenda[i-1]).id;
          m.agenda[i] = _.clone(m.agenda[i-1]);
          m.agenda[i-1] = _.clone(temp);
          logger.info("上移议题成功："+ temp.name);
        } else {
          return res.json(202);
        }
      } else {
        if((i-1+2) < m.agenda.length){
          broId = _.clone(m.agenda[i-1+2]).id;
          m.agenda[i] = _.clone(m.agenda[i-1+2]);
          m.agenda[i-1+2] = _.clone(temp);
          logger.info("下移资源成功："+ temp.name);
          break;
        } else {
          return res.json(202);
        }
      }
    }
  }
  M.checkAgendaIndex(m.agenda);
  res.json(200);
});


//删除议程
router.delete('/:mid/agenda/:aid',function(req,res) {
  var mid = req.params.mid;
  var aid = req.params.aid;
  M.removeAgenda(mid, aid);
  logger.info("删除议程缓存："+aid);
  res.json(200);
});


/************************************媒体资料**********************************/
router.get('/media',function(req,res,next){
  var mid = req.query.meetingid;
  if(mid) {
    var m = M.getMeeting(mid);
    if (!m){
      return res.render('meeting/create', {type: "0", user: req.session.user});
    }
    return res.render('meeting/media',{mid: m.id, models: m.source||[], user: req.session.user});
  }else{
    return res.status(404).json({error:"会议不存在"});
  }
});
//会议:上传文件
router.post('/upload/:mid/file/:aid',function(req,res) {
  var mid = req.params.mid;
  var aid = req.params.aid;
  var savePath = path.join(config.ftpPath, mid);
  savePath = savePath.replace(/\\/g,'//');
  helper.createDirectory(savePath);
  var m = M.getMeeting(mid);
  formidable.upload(req, savePath, function (err, file, data) {
    if (err) {
      return res.json({code: 500});
    }
    var sid = uuid.v4();
    var savename = sid + file.name.substring(file.name.lastIndexOf('.'));
    var op = path.join(dirPath,file.path).replace(/\\/g,"//");
    var relaPath = path.join(config.ftpPath,mid);
    var np = path.join(dirPath,relaPath,savename).replace(/\\/g,"//");
    helper.rename(op,np);
    var s = {
      id: sid,
      type: 'file',
      name: helper.checkFileName(file.name, _.pluck(m.source, 'name'), 1),
      extension: file.name.substring(file.name.lastIndexOf('.')+1),
      public: "false",
      link: '',
      aid_link: ''
    };
    M.insertSource(mid, s);
    var a = M.getAgendaById(mid,aid);
    a.source.push(sid);
    logger.info("添加议题资源缓存："+s.name);
    res.json(200);
  });
});

//删除会议文件
router.delete('/:mid/source/:sid',function(req,res) {
  var mid = req.params.mid;
  var sid = req.params.sid;
  var s = M.getSourceById(mid, sid);
  var caseid = M.removeSource(mid, sid);
  console.log(path.join(dirPath, config.ftpPath, mid, s.id+'.'+s.extension))
  helper.deleteFile(path.join(dirPath, config.ftpPath, mid, s.id+'.'+s.extension));
  return res.sendStatus(200);
});

//资料移动
router.post('/changeMediaIndex', function(req, res) {
    var mid = req.body.mid,
        aid = req.body.aid,
        sid = req.body.sid;
    var a = M.getAgendaById(mid, aid);
    for (var i in a.source){
        if(a.source[i] == sid){
            var temp = _.clone(a.source[i]);
            if(req.body.t == '0'){
                if(a.source[i-1]){
                    a.source[i] = _.clone(a.source[i-1]);
                    a.source[i-1] = _.clone(temp);
                    logger.info("上移资源成功："+ M.getSourceById(mid,sid).name);
                    break;
                } else {
                    return res.json(202);
                }
            } else {
                if((i-1+2) < a.source.length){
                    a.source[i] = _.clone(a.source[i-1+2]);
                    a.source[i-1+2] = _.clone(temp);
                    logger.info("下移资源成功："+ M.getSourceById(mid,sid).name);
                    break;
                } else {
                    return res.json(202);
                }
            }
        }
    }
    res.json(200);
});

module.exports = router;
