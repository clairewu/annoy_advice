/**
 * config
 */

exports.config = {
	name: '匿名意见系统',
	description: '',
	host: 'http://127.0.0.1',
	db: 'mongodb://127.0.0.1/anony_advice_v2',
	session_secret: 'anony_advice',
	auth_cookie_name: 'anony_advice',
	port: 99,
	version: '0.0.1',

	// topics list count
	list_topic_count: 20,

	// mail SMTP
	mail_port: 465,
	mail_user: 'claire.chunmei@gmail.com',
	mail_pass: 'ASdf1234',
	mail_host: 'smtp.gmail.com',
	mail_sender: 'claire.chunmei@gmail.com',
	mail_use_authentication: true,

	
	// admins
	admins: {admin:true}
};

