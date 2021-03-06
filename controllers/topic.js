var models = require('../models'),
	Tag = models.Tag,
	Topic = models.Topic,
	TopicTag = models.TopicTag,
	TopicCollect = models.TopicCollect,
	User = models.User;
	
var check = require('validator').check,
	sanitize = require('validator').sanitize;

var at_ctrl = require('./at');
var tag_ctrl = require('./tag');
var user_ctrl = require('./user');
var reply_ctrl = require('./reply');
var EventProxy = require('eventproxy').EventProxy;
var message_ctrl = require('./message');
var Markdown = require('node-markdown').Markdown;
var Util = require('../libs/util');

var config = require('../config').config;

exports.index = function(req,res,next){
	var topic_id = req.params.tid;
	if(topic_id.length != 24){
		res.render('notify/notify',{error: '此话题不存在或已被删除。'});
		return;	
	}

	var proxy = new EventProxy();
	var render = function(topic,author_other_topics,no_reply_topics){
		at_ctrl.link_at_who(topic.content,function(err,str){
			if(err) return next(err);
			topic.content = str;
			res.render('topic/index',{topic:topic,author_other_topics:author_other_topics,no_reply_topics:no_reply_topics});
		});
	};
	proxy.assign('topic','author_other_topics','no_reply_topics',render);

	get_full_topic(topic_id,function(err,message,topic,tags,author,replies){
		if(err) return next(err);
		if(message){
			res.render('notify/notify',{error: message});
			return;	
		}

		topic.visit_count +=1;
		topic.save(function(err){
			if(!topic.content_is_html){
				// trans Markdown to HTML
				topic.content = Markdown(topic.content,true);
			}
			// format date
			topic.friendly_create_at = Util.format_date(topic.create_at,true);
			topic.friendly_update_at = Util.format_date(topic.update_at,true);

			topic.tags = tags;
			topic.author = author;
			topic.replies = replies;

			if(!req.session.user){
				proxy.trigger('topic',topic);
			}else{
				TopicCollect.findOne({user_id:req.session.user._id, topic_id:topic._id},function(err,doc){
					if(err) return next(err);
					topic.in_collection = doc;
					proxy.trigger('topic',topic);
				});
			}
		
			var opt = {limit:5, sort:[['last_reply_at','desc']]};
			get_topics_by_query({author_id:topic.author_id,_id:{'$nin':[topic._id]}},opt,function(err,topics){
				if(err) return next(err);
				proxy.trigger('author_other_topics',topics);
			});
			opt = {limit:5, sort:[['create_at','desc']]};
			get_topics_by_query({reply_count:0},opt,function(err,topics){
				if(err) return next(err);
				proxy.trigger('no_reply_topics',topics);
			});
		});
	});
};

exports.create = function(req,res,next){
	var method = req.method.toLowerCase();
	if(method == 'get'){
		tag_ctrl.get_all_tags(function(err,tags){
			if(err) return next(err);
			res.render('topic/edit',{tags:tags});
			return;
		});
	}

	if(method == 'post'){
		var title = sanitize(req.body.title).trim();
		title = sanitize(title).xss();
		var content = req.body.t_content;
		var topic_tags=[];
		var pass = sanitize(req.body.pass).trim();
		pass = sanitize(pass).xss();
		var re_pass = sanitize(req.body.re_pass).trim();
		re_pass = sanitize(re_pass).xss();
		
		if(req.body.topic_tags != ''){
			topic_tags = req.body.topic_tags.split(',');
		}	

		if(title == ''){
			tag_ctrl.get_all_tags(function(err,tags){
				if(err) return next(err);
				for(var i=0; i<topic_tags.length; i++){
					for(var j=0; j<tags.length; j++){
						if(topic_tags[i] == tags[j]._id){
							tags[j].is_selected = true;
						}
					}	
				}
				res.render('topic/edit',{tags:tags, edit_error:'标题不能是空的。', content:content});
				return;
			});
		}else if(title.length<10 || title.length>100){
			tag_ctrl.get_all_tags(function(err,tags){
				if(err) return next(err);
				for(var i=0; i<topic_tags.length; i++){
					for(var j=0; j<tags.length; j++){
						if(topic_tags[i] == tags[j]._id){
							tags[j].is_selected = true;
						}
					}	
				}
				res.render('topic/edit',{tags:tags, edit_error:'标题字数太多或太少', content:content});
				return;
			});
		}else if(pass =='' || re_pass == ''){
			tag_ctrl.get_all_tags(function(err,tags){
				if(err) return next(err);
				for(var i=0; i<topic_tags.length; i++){
					for(var j=0; j<tags.length; j++){
						if(topic_tags[i] == tags[j]._id){
							tags[j].is_selected = true;
						}
					}	
				}
				res.render('topic/edit',{tags:tags, title:title, edit_error:'请同时输入密码和确认密码', content:content});
				return;
			});
		}else if(pass != re_pass){
			tag_ctrl.get_all_tags(function(err,tags){
				if(err) return next(err);
				for(var i=0; i<topic_tags.length; i++){
					for(var j=0; j<tags.length; j++){
						if(topic_tags[i] == tags[j]._id){
							tags[j].is_selected = true;
						}
					}	
				}
				res.render('topic/edit',{tags:tags, title:title, edit_error:'两次密码输入不一致。', content:content});
				return;
			});
		}else{
			var topic = new Topic();
			topic.title = title;
			topic.content = content;
			topic.passwd = pass;
			//advice
			if(req.session.user)
				topic.author_id = req.session.user._id;
			topic.save(function(err){
				if(err) return next(err);
			
				var proxy = new EventProxy();
				var render = function(){
					//res.redirect('/topic/'+topic._id);					
					res.render('notify/notify',{success: '提交成功！请牢记建议编号：' + topic._id + '！它将作为您查看您的意见的唯一凭证！'});
				}

				proxy.assign('tags_saved','score_saved',render)
				//话题可以没有标签
				if(topic_tags.length == 0){
					proxy.trigger('tags_saved');
				}
				var tags_saved_done = function(){
					proxy.trigger('tags_saved');
				};
				proxy.after('tag_saved',topic_tags.length,tags_saved_done);
				//save topic tags	
				for(var i=0; i<topic_tags.length; i++){
					(function(i){
						var topic_tag = new TopicTag();
						topic_tag.topic_id = topic._id;
						topic_tag.tag_id = topic_tags[i];
						topic_tag.save(function(err){
							if(err) return next(err);
							proxy.trigger('tag_saved');
						});
						tag_ctrl.get_tag_by_id(topic_tags[i],function(err,tag){
							if(err) return next(err);
							tag.topic_count += 1;
							tag.save();
						});
					})(i);
				}
				//advice:
				User.findOne({'loginname':'admin'}, function(err,retuser){
					if(err) return next(err);
					if(req.session.user)
						topic.author_id = req.session.user._id;
					else
						topic.author_id = retuser._id;
					user_ctrl.get_user_by_id(topic.author_id,function(err,user){
						if(err) return next(err);
						user.score += 5;
						user.topic_count += 1;
						user.save()
						proxy.trigger('score_saved');
					});
				});

				//发送at消息
				at_ctrl.send_at_message(content,topic._id,topic.author_id);
			});
		}
					
	}	
};

exports.edit = function(req,res,next){
	if(!req.session.user){
		res.redirect('home');
		return;
	}

	var topic_id = req.params.tid;
	var method = req.method.toLowerCase();
	if(method == 'get'){
		if(topic_id.length != 24){
			res.render('notify/notify',{error: '此话题不存在或已被删除。'});
			return;	
		}
		get_topic_by_id(topic_id,function(err,topic,tags,author){
			if(!topic){
				res.render('notify/notify',{error: '此话题不存在或已被删除。'});
				return;	
			}
			if(topic.author_id == req.session.user._id || req.session.user.is_admin){
				tag_ctrl.get_all_tags(function(err,all_tags){
					if(err) return next(err);
					for(var i=0; i<tags.length; i++){
						for(var j=0; j<all_tags.length; j++){
							if(tags[i].id == all_tags[j].id){
								all_tags[j].is_selected = true;
							}
						}	
					}

					res.render('topic/edit',{action:'edit',topic_id:topic._id,title:topic.title,content:topic.content,tags:all_tags});
				});
			}else{
				res.render('notify/notify',{error:'对不起，你不能编辑此话题。'});
				return;
			}
		});
	}
	if(method == 'post'){
		if(topic_id.length != 24){
			res.render('notify/notify',{error: '此话题不存在或已被删除。'});
			return;	
		}
		get_topic_by_id(topic_id,function(err,topic,tags,author){
			if(!topic){
				res.render('notify/notify',{error: '此话题不存在或已被删除。'});
				return;	
			}
			if(topic.author_id == req.session.user._id || req.session.user.is_admin){
				var title = sanitize(req.body.title).trim();
				title = sanitize(title).xss();
				var content = req.body.t_content;
				var topic_tags=[];
				if(req.body.topic_tags != ''){
					topic_tags = req.body.topic_tags.split(',');
				}

				if(title == ''){
					tag_ctrl.get_all_tags(function(err,all_tags){
						if(err) return next(err);
						for(var i=0; i<topic_tags.length; i++){
							for(var j=0; j<all_tags.length; j++){
								if(topic_tags[i] == all_tags[j]._id){
									all_tags[j].is_selected = true;
								}
							}	
						}
						res.render('topic/edit',{action:'edit',edit_error:'标题不能是空的。',topic_id:topic._id, content:content,tags:all_tags});
						return;
					});
				}else{
					//保存话题
					//删除topic_tag，标签topic_count减1
					//保存新topic_tag	
					topic.title = title;
					topic.content = content;
					topic.update_at = new Date();
					topic.save(function(err){
						if(err) return next(err);

						var proxy = new EventProxy();
						var render = function(){
							res.redirect('/topic/'+topic._id);
						}
						proxy.assign('tags_removed_done','tags_saved_done',render);

						// 删除topic_tag
						var tags_removed_done = function(){
							proxy.trigger('tags_removed_done');
						};
						TopicTag.find({topic_id:topic._id},function(err,docs){
							if(docs.length == 0){
								proxy.trigger('tags_removed_done');
							}else{
								proxy.after('tag_removed',docs.length,tags_removed_done);
								// delete topic tags
								for(var i=0; i<docs.length; i++){
									(function(i){
										docs[i].remove(function(err){
											if(err) return next(err);
											tag_ctrl.get_tag_by_id(docs[i].tag_id,function(err,tag){
												if(err) return next(err);
												proxy.trigger('tag_removed');
												tag.topic_count -= 1;
												tag.save();
											});
										});
									})(i); 
								}
							}
						});
					
						// 保存topic_tag
						var tags_saved_done = function(){
							proxy.trigger('tags_saved_done');
						}	
						//话题可以没有标签
						if(topic_tags.length == 0){
							proxy.trigger('tags_saved_done');
						}else{
							proxy.after('tag_saved',topic_tags.length,tags_saved_done);
							//save topic tags	
							for(var i=0; i<topic_tags.length; i++){
								(function(i){
									var topic_tag = new TopicTag();
									topic_tag.topic_id = topic._id;
									topic_tag.tag_id = topic_tags[i];
									topic_tag.save(function(err){
										if(err) return next(err);
										proxy.trigger('tag_saved');
									});
									tag_ctrl.get_tag_by_id(topic_tags[i],function(err,tag){
										if(err) return next(err);
										tag.topic_count += 1;
										tag.save();
									});
								})(i);
							}
						}

						//发送at消息
						at_ctrl.send_at_message(content,topic._id,req.session.user._id);
					});
				}	
			}else{
				res.render('notify/notify',{error:'对不起，你不能编辑此话题。'});
				return;
			}
		});
	}
};

exports.delete = function(req,res,next){
	//删除话题, 话题作者topic_count减1
	//删除回复，回复作者reply_count减1
	//删除topic_tag，标签topic_count减1
	//删除topic_collect，用户collect_topic_count减1
	if(!req.session.user || !req.session.user.is_admin){
		res.redirect('home');
		return;
	}
	var topic_id = req.params.tid;
	if(topic_id.length != 24){
		res.render('notify/notify',{error: '此话题不存在或已被删除。'});
		return;	
	}
	get_topic_by_id(topic_id,function(err,topic,tags,author){
		if(!topic){
			res.render('notify/notify',{error: '此话题不存在或已被删除。'});
			return;	
		}
		var proxy = new EventProxy();
		var render = function(){
			res.render('notify/notify',{success: '话题已被删除。'});
			return;
		}
		proxy.assign('topic_removed',render);
		topic.remove(function(err){
			proxy.trigger('topic_removed');
		});
	});
};

exports.collect = function(req,res,next){
	if(!req.session || !req.session.user){
		res.send('forbidden!');
		return;
	}
	var topic_id = req.body.topic_id;
	Topic.findOne({_id: topic_id},function(err,topic){
		if(err) return next(err);
		if(!topic){
			res.json({status:'failed'});
		}
		
		TopicCollect.findOne({user_id:req.session.user._id,topic_id:topic._id},function(err,doc){
			if(err) return next(err);
			if(doc){
				res.json({status:'success'});
				return;
			}
				
			var topic_collect = new TopicCollect();
			topic_collect.user_id = req.session.user._id;
			topic_collect.topic_id = topic._id;
			topic_collect.save(function(err){
				if(err) return next(err);
				res.json({status:'success'});
			});
			user_ctrl.get_user_by_id(req.session.user._id,function(err,user){
				if(err) return next(err);
				user.collect_topic_count += 1;
				user.save()
			});				

			req.session.user.collect_topic_count += 1;
			topic.collect_count += 1;
			topic.save();
		});
	});
};

exports.de_collect = function(req,res,next){
	if(!req.session || !req.session.user){
		res.send('fobidden!');
		return;
	}
	var topic_id = req.body.topic_id;
	Topic.findOne({_id: topic_id},function(err,topic){
		if(err) return next(err);
		if(!topic){
			res.json({status:'failed'});
		}
		TopicCollect.remove({user_id:req.session.user._id,topic_id:topic._id},function(err){
			if(err) return next(err);
			res.json({status:'success'});
		});

		user_ctrl.get_user_by_id(req.session.user._id,function(err,user){
			if(err) return next(err);
			user.collect_topic_count -= 1;
			user.save();
		});

		topic.collect_count -= 1;
		topic.save();

		req.session.user.collect_topic_count -= 1;
	});
};

// get topic without replies
function get_topic_by_id(id,cb){
	var proxy = new EventProxy();
	var done = function(topic,tags,author,last_reply){
		return cb(null, topic,tags,author,last_reply);
	};
	proxy.assign('topic','tags','author','last_reply',done);

	Topic.findOne({_id:id},function(err,topic){
		if(err) return cb(err);
		if(!topic){
			proxy.trigger('topic',null);
			proxy.trigger('tags',[]);
			proxy.trigger('author',null);
			proxy.trigger('last_reply',null);
			return;
		}
		proxy.trigger('topic',topic);
		
		TopicTag.find({topic_id: topic._id}, function(err,topic_tags){
			if(err) return cb(err);
			var tags_id = [];
			for(var i=0; i<topic_tags.length; i++){
				tags_id.push(topic_tags[i].tag_id);
			}
			tag_ctrl.get_tags_by_ids(tags_id,function(err,tags){
				if(err) return cb(err);
				proxy.trigger('tags',tags);
			});
		});
		
		user_ctrl.get_user_by_id(topic.author_id,function(err,author){
			if(err) return cb(err);
			proxy.trigger('author',author);
		});

		if(topic.last_reply){
			reply_ctrl.get_reply_by_id(topic.last_reply,function(err,last_reply){
				if(err) return cb(err);
				if(!last_reply){
					proxy.trigger('last_reply',null);
					return;
				}
				proxy.trigger('last_reply',last_reply);
			});
		}else{
			proxy.trigger('last_reply',null);
		}
	});
}
// get topic with replies
function get_full_topic(id,cb){
	var proxy = new EventProxy();
	var done = function(topic,tags,author,replies){
		return cb(null,'', topic,tags,author,replies);
	};
	proxy.assign('topic','tags','author','replies',done);

	Topic.findOne({_id:id},function(err,topic){
		if(err) return cb(err);
		if(!topic){
			return cb(null, '此话题不存在或已被删除。');	
		}
		proxy.trigger('topic',topic);
		
		TopicTag.find({topic_id: topic._id}, function(err,topic_tags){
			if(err) return cb(err);
			var tags_id = [];
			for(var i=0; i<topic_tags.length; i++){
				tags_id.push(topic_tags[i].tag_id);
			}
			tag_ctrl.get_tags_by_ids(tags_id,function(err,tags){
				if(err) return cb(err);
				proxy.trigger('tags',tags);
			});
		});
		
		//advice:
		user_ctrl.get_user_by_id(topic.author_id,function(err,author){
			if(err) return cb(err);
			/*if(!author){
				return cb(null, '话题的作者丢了。');	
			}*/
			proxy.trigger('author',author);
		});
		
		reply_ctrl.get_replies_by_topic_id(topic._id,function(err,replies){
			if(err) return cb(err);
			proxy.trigger('replies',replies);
		});
	});

}
function get_topics_by_query(query,opt, cb){
	Topic.find(query,['_id'],opt,function(err,docs){
		if(err) return cb(err,null);
		if(docs.length ==0) return cb(err,[]);

		var topics_id = [];
		for(var i=0; i<docs.length; i++){
			topics_id.push(docs[i]._id);
		}

		var proxy = new EventProxy();
		var done = function(){
			return cb(null, topics);
		}
		var topics = [];
		proxy.after('topic_ready',topics_id.length,done);
		for(var i=0; i<topics_id.length; i++){
			(function(i){
				get_topic_by_id(topics_id[i], function(err,topic,tags,author,last_reply){
					if(err) return cb(err);
					topic.tags = tags;
					topic.author = author;
					topic.reply = last_reply;
					topic.friendly_create_at = Util.format_date(topic.create_at,true);
					topics[i] = topic;
					proxy.trigger('topic_ready');
				});	
			})(i);
		}
	});	
}
function get_count_by_query(query,cb){
	Topic.count(query,function(err,count){
		if(err) return cb(err);
		return cb(err,count);
	});
}

exports.get_topic_by_id = get_topic_by_id;
exports.get_full_topic = get_full_topic;
exports.get_topics_by_query = get_topics_by_query;
exports.get_count_by_query = get_count_by_query;

exports.view = function(req,res,next){
	var method = req.method.toLowerCase();
		
	if(method == 'get'){
		//If it is admin, passwd is not needed
		if(req.session.user){
			exports.index(req,res,next);
			return;
		}
		
		if(req.params.tid)
			res.render('topic/view', {topic_id:req.params.tid});
		else
			res.render('topic/view');
	}

	if(method == 'post'){
		var topic_id = sanitize(req.body.topic_id).trim();
		var passwd = sanitize(req.body.password).trim();

		get_full_topic(topic_id,function(err,message,topic){
			if(message){
				res.render('notify/notify',{error: message});
				return;	
			}
			if(err || !topic){
				res.render('notify/notify',{error: '此话题不存在或已被删除。'});
				return;
			}
			if(topic.passwd!=passwd){
				res.render('notify/notify',{error: '密码错误'});
				return;
			}		
			req.params.tid = topic_id;
			exports.index(req,res,next);
		});
	}
};

