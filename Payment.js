'use strict';

/**
 * @namespace Payment
 *
 * This file contains the Webhook handlers
 */

var server = require('server');

// dw imports

var OrderMgr = require('dw/order/OrderMgr');
var Resource = require('dw/web/Resource');
var customLogger = require('*/cartridge/scripts/helpers/commonHelpers').customLogger;
// constants
var SIGNATURE_TYPE = 'SHA256';
var PAYMENT_MODE = JSON.parse(Site.getCurrent().getCustomPreferenceValue("iPay88Config")).paymentMode;
// constants
var LOG_FILENAME_PREFIX = 'payment';
var LOG_CATEGORY = 'controllers.payment';
// PAYMENT_MODE = 3; // 1 = Testing, 2 = Testing with 1 MYR, 3 = Production(actual amount)

/**
 * Payment-IPay88Show : This endpoint is called when customer comes to payment
 * @name Payment-IPay88Show
 * @function
 * @param {middleware} - server.middleware.https
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.get('IPay88Show', server.middleware.https, function (req, res, next) {
    var iPay88Helpers = require('*/cartridge/scripts/helpers/payment/iPay88Helpers');
    var viewData = res.getViewData();
    if (!req.querystring.orderNo) {
       // viewData.error = true;
        viewData.errorMessage = Resource.msg('invalid.request', 'payment', null);
    } else {
        var iPay88Config = JSON.parse(Site.getCurrent().getCustomPreferenceValue("iPay88Config"));
        var paymentMode = PAYMENT_MODE;
        // get order
        var orderNo = req.querystring.orderNo;
        var order = OrderMgr.getOrder(orderNo);
        var validationResponse = iPay88Helpers.validatePaymentRequest(order);
        if (validationResponse.error === true) {
            viewData.error = validationResponse.error;
            viewData.errorMessage = validationResponse.errorMessage;
        } else {
            // get form action url
            var actionURL = iPay88Config.actionURL;
            if (paymentMode === 1) {
                var actionURL = iPay88Config.responseURL;
            }

            // get order total amount
            var orderGrossPrice = order.totalGrossPrice.value;
            if (paymentMode === 2) {
                orderGrossPrice = 1.00;
            }
            var orderTotalDecimal = orderGrossPrice.toFixed(2);
            var orderTotal = orderTotalDecimal.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

            // get product description
            var prodDesc = iPay88Helpers.getProdDesc(order);

            //prepare form data
            var formData = {
                iPay88Config: iPay88Config,
                actionURL: actionURL,
                refNo: order.orderNo,
                amount: orderTotal,
                currency: order.totalGrossPrice.currencyCode,
                prodDesc: prodDesc,
                userName: order.customer.profile.firstName + ' ' + order.customer.profile.lastName,
                userEmail: order.customer.profile.email,
                userContact: order.customer.profile.phoneMobile,
                signatureType: SIGNATURE_TYPE
            }
            // generate signature
            formData.signature = iPay88Helpers.generateSignature(formData, 'request');

            viewData.formData = formData;
        }
    }
    res.render('payment/iPay88Form');
    return next();
});

/**
 * Payment-IPay88Success : The IPay88 redirects to this controller
 * @name Payment-IPay88Success
 * @function
 * @param {middleware} - server.middleware.https
 * @param {renders} - isml
 * @param {serverfunction} - get
 */
server.post('IPay88Success', server.middleware.https, function (req, res, next) {
    try {
        var OrderMgr = require('dw/order/OrderMgr');
        var Order = require('dw/order/Order');
        var Transaction = require('dw/system/Transaction');
        var formData = req.form;
        var orderNo = formData.RefNo;
        var status = formData.Status;
        var authCode = formData.AuthCode;
        var paymentStatus = true;
        var order = OrderMgr.getOrder(orderNo);
        if (order) {
            var paymentTransaction = order.paymentInstrument.getPaymentTransaction();
            Transaction.wrap(function () {
                paymentTransaction.custom.iPay88ReturnRequest = JSON.stringify(formData);
                if (status === '0' && authCode === undefined) {
                    paymentStatus = false;
                    OrderMgr.failOrder(order, true);
                    order.custom.orderStatus = Order.ORDER_STATUS_FAILED;
                }
            });
        }
        res.render('payment/iPay88Success', { paymentStatus: paymentStatus });
    } catch (error) {
        customLogger(LOG_FILENAME_PREFIX, LOG_CATEGORY, 'ERROR', error);
    }
    return next();
});

module.exports = server.exports();
