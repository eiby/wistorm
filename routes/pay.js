/**
 * Created with JetBrains WebStorm.
 * User: 1
 * Date: 14-2-12
 * Time: 下午1:49
 * To change this template use File | Settings | File Templates.
 */
var db = require("../lib/db.js");
var util = require("../lib/myutil.js");
var define = require("../lib/define.js");
var alipay = require("../lib/alipay.js");
var xmlreader = require("xmlreader");

// 获取最终支付地址
exports.doPay = function (req, res) {
    var auth_code = req.query.auth_code;
    db.ifAuthCodeValid(auth_code, function (valid) {
        if (valid) {
            var pay_req = alipay.createReq(alipay.services.create, null);
            pay_req.req_id = req.query.order_id.toString();
            pay_req.req_data = {
                subject: req.query.product_name,                 // # 商品名称
                out_trade_no: req.query.order_id.toString(),     // # 网站订单号
                total_fee: parseFloat(req.query.total_price),    // # 价钱(number)，单位元，例如 0.01 代表1分钱
                seller_account_name: alipay.alipay_account,      // # 支付宝账号
                call_back_url: alipay.call_back_url,             // # 支付成功后浏览器跳转地址
                notify_url: alipay.notify_url,                   // # 支付成功支付宝的通知将异步发送到此地址
                out_user: req.query.cust_id,                     // # 网站的用户标识
                merchant_url: alipay.merchant_url,               // # 商品展示页面， 只是实际测试时(ios)发现支付时没地方可以跳到这个页面
                pay_expire: 1440                                 // # 交易过期时间
            };
            pay_req.req_data = alipay.toReqData('direct_trade_create_req', pay_req.req_data);
            pay_req.sign = alipay.getSign(pay_req, alipay.key);
            alipay.sendCreate(pay_req, function (err, doc) {
                if (err) {
                    obj = {
                        status_code: define.API_STATUS_PAY_FAIL,  //0 成功 >0 失败
                        err_msg: "pay failed."
                    };
                    res.send(obj);
                } else {
                    var token = alipay.parseTokenFromXml(doc.res_data);
                    var pay_url = alipay.createAuthUrl(token, alipay.key);
                    obj = {
                        status_code: define.API_STATUS_OK, //0 成功 >0 失败
                        redirect: pay_url
                    };
                    res.send(obj);
                }
            });
        } else {
            util.resSendNoRight(res);
        }
    });
};

// 支付回调
exports.doCallback = function (req, res) {
    var sign = alipay.getSign(req.query, alipay.key);
    if (sign == req.query.sign) {
        //res.send("签名正确");
        //out_trade_no=2014021100000013004857&request_token=requestToken&result=success&trade_no=2014021925771857
        var out_trade_no = req.query.out_trade_no;
        var trade_no = req.query.trade_no;
        var result = req.query.result;
        db.updateOrderAlipay(out_trade_no, trade_no, 4, function (row) {
            if (row > 0) {
                res.render('callback', { status: '支付成功' });
            } else {
                res.render('callback', { status: '支付成功，状态同步中' });
            }
        });
    } else {
        res.render('callback', { status: '签名错误' });
    }
};

// 支付取消
exports.doCancel = function (req, res) {
    res.render('cancel', {});
};

// WAP支付通知
exports.doNotify = function (req, res) {
    var sign = alipay.getNotitySign(req.body, alipay.key);
    if (sign == req.body.sign) {
        //res.send("签名正确");
        //out_trade_no=2014021100000013004857&request_token=requestToken&result=success&trade_no=2014021925771857
        var notify_data = req.body.notify_data;
        xmlreader.read(notify_data, function (errors, response) {
            if (null !== errors) {
                res.send("fail");
            } else {
                var trade_status = response.notify.trade_status.text();
                var out_trade_no = response.notify.out_trade_no.text();
                var trade_no = response.notify.trade_no.text();
                if (trade_status == "TRADE_SUCCESS" || trade_status == "TRADE_FINISHED")
                    db.updateOrderAlipay(out_trade_no, trade_no, 1, function (row) {
                        if (row > 0) {
                            res.send("success");
                        } else {
                            res.send("fail");
                        }
                    });
            }
        });
    } else {
        res.send("fail");
    }
};

// APP支付通知
exports.doAppNotify = function (req, res) {
    var body = req.body;
    body.subject = decodeURIComponent(body.subject);
    body.body = decodeURIComponent(body.body);
    var valid = alipay.checkRsaSign(body);
    if (valid) {
        var trade_status = req.body.trade_status;
        var out_trade_no = req.body.out_trade_no;
        var trade_no = req.body.trade_no;
        if (trade_status == "TRADE_SUCCESS" || trade_status == "TRADE_FINISHED")
            db.updateOrderAlipay(out_trade_no, trade_no, 1, function (row) {
                if (row > 0) {
                    res.send("success");
                } else {
                    res.send("fail");
                }
            });
    } else {
        res.send("fail");
    }
};

// 支付宝公众服务接口
exports.doAlipayService = function (req, res) {
    //res.send("签名正确");
    //out_trade_no=2014021100000013004857&request_token=requestToken&result=success&trade_no=2014021925771857
    var biz_content = req.body.biz_content;
    xmlreader.read(biz_content, function (errors, response) {
        if (null !== errors) {
            res.send("fail");
        } else {
            var event_type = response.XML.EventType.text();
            if (event_type == "verifygw") {
                var sign = alipay.getRsaSign("<biz_content>MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCtl32p+xql8QO4LiQU1ekZ+MsgWBxoMyd9Hah0mschtjis7ty1DOa26iSlNN30Fs5+gCLb/IXFRRj9kPUQDy/RvZ7gUfuenRp0Ced/fB4jmTtrv5L7D/LE9Al3gQhTY/SvRmpOLIyXxzpDReWs8ZXLJxnzVemm2WjCJ7ZOVdAalwIDAQAB</biz_content><success>true</success>");
                var result = '<?xml version="1.0" encoding="GBK"?>' +
                    '<alipay>' +
                    '<response>' +
                    '<success>true</success>' +
                    '<biz_content>MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCtl32p+xql8QO4LiQU1ekZ+MsgWBxoMyd9Hah0mschtjis7ty1DOa26iSlNN30Fs5+gCLb/IXFRRj9kPUQDy/RvZ7gUfuenRp0Ced/fB4jmTtrv5L7D/LE9Al3gQhTY/SvRmpOLIyXxzpDReWs8ZXLJxnzVemm2WjCJ7ZOVdAalwIDAQAB</biz_content>' +
                    '</response>' +
                    '<sign>' + sign + '</sign>' +
                    '<sign_type>RSA</sign_type>' +
                    '</alipay>';
                res.contentType('application/xml');
                res.charset = 'GBK';
                res.send(result);
            }
        }
    });
};