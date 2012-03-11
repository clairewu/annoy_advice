##匿名意见系统

###### 介绍
匿名意见系统 是用 **Node.js** 和 **MongoDb** 开发的软件.它是在Node Club基础上作了修改.

###### 安装部署
    // install node npm mongodb  
    // run mongod
    cd advice
    npm install ./
	cp config.js.default config.js
    // modify config.js as yours
    node app.js
	
###### 初始配置
第一次访问匿名建议系统时,请先用管理员帐号(用户名/密码:admin/admin)登录,然后通过设置连接来修改密码.
    
###### 其它
小量修改了两个依赖模块：node-markdown，express
 
   1.node-markdown/lib/markdown.js allowedTags 添加 `embed` 标签以支持 flash 视频，allowedAttributes 添加：
   
    embed:'src|quality|width|height|align|allowScriptAccess|allowFullScreen|mode|type'
       
   2.express/node_modules/connect/lib/middleware/csrf.js 添加：
   
    if (req.xhr === true) return next();
    if (req.body.user_action && req.body.user_action == 'upload_image') return next();
  