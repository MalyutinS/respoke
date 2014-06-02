/**************************************************************************************************
 *
 * Copyright (c) 2014 Digium, Inc.
 * All Rights Reserved. Licensed Software.
 *
 * @authors : Erin Spiceland <espiceland@digium.com>
 */

/**
 * WebRTC Call including getUserMedia, path and codec negotation, and call state.
 * @author Erin Spiceland <espiceland@digium.com>
 * @class respoke.Call
 * @constructor
 * @augments respoke.EventEmitter
 * @param {object} params
 * @param {string} params.instanceId - client id
 * @param {boolean} params.caller - whether or not we initiated the call
 * @param {boolean} [params.receiveOnly] - whether or not we accept media
 * @param {boolean} [params.sendOnly] - whether or not we send media
 * @param {boolean} [params.directConnectionOnly] - flag to enable skipping media & opening direct connection.
 * @param {boolean} [params.forceTurn] - If true, media is not allowed to flow peer-to-peer and must flow through
 * relay servers. If it cannot flow through relay servers, the call will fail.
 * @param {boolean} [params.disableTurn] - If true, media is not allowed to flow through relay servers; it is
 * required to flow peer-to-peer. If it cannot, the call will fail.
 * @param {respoke.Endpoint} params.remoteEndpoint - The endpoint who is being called.
 * @param {string} [params.connectionId] - The connection ID of the remoteEndpoint.
 * @param {respoke.Call.previewLocalMedia} [params.previewLocalMedia] - A function to call if the developer
 * wants to perform an action between local media becoming available and calling approve().
 * @param {function} params.signalOffer - Signaling action from SignalingChannel.
 * @param {function} params.signalConnected - Signaling action from SignalingChannel.
 * @param {function} params.signalAnswer - Signaling action from SignalingChannel.
 * @param {function} params.signalHangup - Signaling action from SignalingChannel.
 * @param {function} params.signalReport - Signaling action from SignalingChannel.
 * @param {function} params.signalCandidate - Signaling action from SignalingChannel.
 * @param {respoke.Call.onError} [params.onError] - Callback for errors that happen during call setup or
 * media renegotiation.
 * @param {respoke.Call.onLocalMedia} [params.onLocalMedia] - Callback for receiving an HTML5 Video
 * element with the local audio and/or video attached.
 * @param {respoke.Call.onConnect} [params.onConnect] - Callback for the remote video element.
 * @param {respoke.Call.onHangup} [params.onHangup] - Callback for when the call is ended, whether or not
 * it was ended in a graceful manner. TODO: add the hangup reason to the Event.
 * @param {respoke.Call.onMute} [params.onMute] - Callback for changing the mute state on any type of media.
 * This callback will be called when media is muted or unmuted.
 * @param {respoke.Call.onAnswer} [params.onAnswer] - Callback for when the callee answers the call.
 * @param {respoke.Call.onRequestingMedia} [params.onRequestingMedia] - Callback for when the app is waiting
 * for the user to give permission to start getting audio or video.
 * @param {respoke.Call.onApprove} [params.onApprove] - Callback for when the user approves local media. This
 * callback will be called whether or not the approval was based on user feedback. I. e., it will be called even if
 * the approval was automatic.
 * @param {respoke.Call.onAllow} [params.onAllow] - Callback for when the browser gives us access to the
 * user's media.  This event gets called even if the allow process is automatic, i. e., permission and media is
 * granted by the browser without asking the user to approve it.
 * @param {object} params.callSettings
 * @returns {respoke.Call}
 */
/*global respoke: false */
respoke.Call = function (params) {
    "use strict";
    params = params || {};
    /**
     * @memberof! respoke.Call
     * @name instanceId
     * @private
     * @type {string}
     */
    var instanceId = params.instanceId;
    var that = respoke.EventEmitter(params);
    delete that.instanceId;
    /**
     * A name to identify the type of object.
     * @memberof! respoke.Call
     * @name className
     * @type {string}
     */
    that.className = 'respoke.Call';

    if (!that.caller) {
        /**
         * Whether or not the client is the caller of the call.
         * @memberof! respoke.Call
         * @name caller
         * @type {boolean}
         */
        that.caller = false;
    } else {
        /**
         * The call ID.
         * @memberof! respoke.Call
         * @name id
         * @type {string}
         */
        that.id = respoke.makeGUID();
    }

    if (!that.id) {
        throw new Error("Can't start a new call without a call id.");
    }

    /**
     * Promise used to trigger actions dependant upon having received an offer.
     * @memberof! respoke.Call
     * @name defSDPOffer
     * @private
     * @type {Promise}
     */
    var defSDPOffer = Q.defer();
    /**
     * Promise used to trigger actions dependant upon having received an answer.
     * @memberof! respoke.Call
     * @name defSDPAnswer
     * @private
     * @type {Promise}
     */
    var defSDPAnswer = Q.defer();
    /**
     * Promise used to trigger actions dependant upon the call having been answered.
     * @memberof! respoke.Call
     * @name defAnswered
     * @private
     * @type {Promise}
     */
    var defAnswered = Q.defer();
    /**
     * Promise used to trigger actions dependant upon having received media or a datachannel.
     * @memberof! respoke.Call
     * @name defApproved
     * @private
     * @type {Promise}
     */
    var defApproved = Q.defer();
    /**
     * Promise used to trigger actions dependant upon having received media or a datachannel.
     * @memberof! respoke.Call
     * @name defMedia
     * @private
     * @type {Promise}
     */
    var defMedia = Q.defer();
    /**
     * Promise used to trigger notification of a request for renegotiating media. For the caller of the
     * renegotiation (which doesn't have to be the same as the caller of the call), this is resolved
     * or rejected as soon as the 'accept' or 'reject' signal is received. For the callee, it is
     * resolved or rejected only after the developer or user approves or rejects the modify.
     * @memberof! respoke.Call
     * @name defModify
     * @private
     * @type {Promise}
     */
    var defModify;
    /**
     * @memberof! respoke.Call
     * @name previewLocalMedia
     * @private
     * @type {respoke.Call.previewLocalMedia}
     */
    var previewLocalMedia = null;
    /**
     * @memberof! respoke.Call
     * @name directConnectionOnly
     * @private
     * @type {boolean}
     */
    var directConnectionOnly = null;
    /**
     * @memberof! respoke.Call
     * @name sendOnly
     * @private
     * @type {boolean}
     */
    var sendOnly = null;
    /**
     * @memberof! respoke.Call
     * @name receiveOnly
     * @private
     * @type {boolean}
     */
    var receiveOnly = null;
    /**
     * @memberof! respoke.Call
     * @name forceTurn
     * @private
     * @type {boolean}
     */
    var forceTurn = null;
    /**
     * @memberof! respoke.Call
     * @name client
     * @private
     * @type {respoke.getClient}
     */
    var client = respoke.getClient(instanceId);
    /**
     * @memberof! respoke.Call
     * @name videoLocalElement
     * @private
     * @type {Video}
     */
    var videoLocalElement = null;
    /**
     * @memberof! respoke.Call
     * @name videoRemoteElement
     * @private
     * @type {Video}
     */
    var videoRemoteElement = null;
    /**
     * @memberof! respoke.Call
     * @name videoIsMuted
     * @private
     * @type {boolean}
     */
    var videoIsMuted = false;
    /**
     * @memberof! respoke.Call
     * @name audioIsMuted
     * @private
     * @type {boolean}
     */
    var audioIsMuted = false;
    /**
     * @memberof! respoke.Call
     * @name callSettings
     * @private
     * @type {object}
     */
    var callSettings = params.callSettings;
    /**
     * @memberof! respoke.Call
     * @name directConnection
     * @private
     * @type {respoke.DirectConnection}
     */
    var directConnection = null;
    /**
     * @memberof! respoke.Call
     * @name localStreams
     * @private
     * @type {Array<respoke.LocalMedia>}
     */
    var localStreams = [];
    /**
     * @memberof! respoke.Call
     * @name toSendHangup
     * @private
     * @type {boolean}
     */
    var toSendHangup = null;

    /**
     * @memberof! respoke.Call
     * @name pc
     * @private
     * @type {respoke.PeerConnection}
     */
    var pc = respoke.PeerConnection({
        instanceId: instanceId,
        forceTurn: forceTurn,
        call: that,
        callSettings: callSettings,
        pcOptions: {
            optional: [
                { DtlsSrtpKeyAgreement: true },
                { RtpDataChannels: false }
            ]
        },
        offerOptions: null,
        signalOffer: params.signalOffer,
        signalConnected: params.signalConnected,
        signalAnswer: params.signalAnswer,
        signalModify: params.signalModify,
        signalHangup: params.signalHangup,
        signalReport: params.signalReport,
        signalCandidate: params.signalCandidate
    });

    /**
     * Set up promises. If we're not the caller, we need to listen for approval AND the remote SDP to come in
     * before we can act on the call. Save parameters sent in with the constructor, then delete them off the call.
     * If this call was initiated with a DirectConnection, set it up so answer() will be the approval mechanism.
     * @method respoke.Call.init
     * @memberof! respoke.Call
     * @fires respoke.Client#call
     * @private
     */
    function init() {
        log.trace('Call.init');

        if (defModify !== undefined) {
            defSDPOffer = Q.defer();
            defSDPAnswer = Q.defer();
            defApproved = Q.defer();
            defAnswered = Q.defer();
            defMedia = Q.defer();
        }

        pc.init(callSettings); // instantiates RTCPeerConnection, can't call on modify
        if (defModify === undefined && directConnectionOnly === true) {
            actuallyAddDirectConnection(params);
        }

        if (that.caller !== true) {
            Q.all([defApproved.promise, defSDPOffer.promise]).spread(function successHandler(approved, oOffer) {
                if (oOffer && oOffer.sdp) {
                    pc.processOffer(oOffer.sdp);
                }
            }, function errorHandler(err) {
                log.warn("Call rejected.");
            }).done();
        } else {
            Q.all([defApproved.promise, defMedia.promise]).spread(function successHandler(approved, media) {
                if (media) {
                    pc.initOffer();
                }
            }, function errorHandler(err) {
                var message = "Call not approved locally or local media error.";
                /**
                 * This event is fired on errors that occur during call setup or media negotiation.
                 * @event respoke.Call#error
                 * @type {respoke.Event}
                 * @property {string} reason - A human readable description about the error.
                 * @property {respoke.Call} target
                 * @property {string} name - the event name.
                 */
                that.fire('error', {
                    reason: message
                });
            });
        }

        if (directConnectionOnly === true) {
            // create the call in stealth mode.
            return;
        }

        /**
         * This event provides notification for when an incoming call is being received.  If the user wishes
         * to allow the call, the app should call evt.call.answer() to answer the call.
         * @event respoke.Client#call
         * @type {respoke.Event}
         * @property {respoke.Call} call
         * @property {respoke.Endpoint} endpoint
         * @property {string} name - the event name.
         * @property {respoke.Client} target
         */
        client.fire('call', {
            endpoint: that.remoteEndpoint,
            call: that
        });
    }

    /**
     * Register any event listeners passed in as callbacks, save other params to answer() and accept().
     * @memberof! respoke.Call
     * @method respoke.Call.saveParameters
     * @param {object} params
     * @param {respoke.Call.previewLocalMedia} [params.previewLocalMedia] - A function to call if the developer
     * wants to perform an action between local media becoming available and calling approve().
     * @param {respoke.Call.onLocalMedia} [params.onLocalMedia] - Callback for receiving an HTML5 Video
     * element with the local audio and/or video attached.
     * @param {respoke.Call.onConnect} [params.onConnect] - Callback for the remote video element.
     * @param {respoke.Call.onHangup} [params.onHangup] - Callback for when the call is ended, whether or not
     * it was ended in a graceful manner. TODO: add the hangup reason to the Event.
     * @param {respoke.Call.onMute} [params.onMute] - Callback for changing the mute state on any type of media.
     * This callback will be called when media is muted or unmuted.
     * @param {respoke.Call.onAnswer} [params.onAnswer] - Callback for when the callee answers the call.
     * @param {respoke.Call.onApprove} [params.onApprove] - Callback for when the user approves local media. This
     * callback will be called whether or not the approval was based on user feedback. I. e., it will fire even if
     * the approval was automatic.
     * @param {respoke.Call.onAllow} [params.onAllow] - Callback for when the browser gives us access to the
     * user's media.  This event gets fired even if the allow process is automatic, i. e., permission and media is
     * granted by the browser without asking the user to approve it.
     * @param {object} [params.callSettings]
     * @param {object} [params.constraints]
     * @param {array} [params.servers]
     * @param {boolean} [params.forceTurn]
     * @param {boolean} [params.receiveOnly]
     * @param {boolean} [params.sendOnly]
     * @private
     * @fires respoke.Call#stats
     */
    function saveParameters(params) {
        that.listen('local-stream-received', params.onLocalMedia);
        that.listen('connect', params.onConnect);
        that.listen('hangup', params.onHangup);
        that.listen('allow', params.onAllow);
        that.listen('answer', params.onAnswer);
        that.listen('approve', params.onApprove);
        that.listen('mute', params.onMute);
        that.listen('requesting-media', params.onRequestingMedia);

        forceTurn = typeof params.forceTurn === 'boolean' ? params.forceTurn : forceTurn;
        receiveOnly = typeof params.receiveOnly === 'boolean' ? params.receiveOnly : receiveOnly;
        sendOnly = typeof params.sendOnly === 'boolean' ? params.sendOnly : sendOnly;
        directConnectionOnly = typeof params.directConnectionOnly === 'boolean' ?
            params.directConnectionOnly : directConnectionOnly;
        previewLocalMedia = typeof params.previewLocalMedia === 'function' ?
            params.previewLocalMedia : previewLocalMedia;

        callSettings = params.callSettings || callSettings || {};
        callSettings.servers = params.servers || callSettings.servers;
        callSettings.constraints = params.constraints || callSettings.constraints;
        callSettings.disableTurn = params.disableTurn || callSettings.disableTurn;

        pc.callSettings = callSettings;
        pc.forceTurn = forceTurn;
        pc.receiveOnly = receiveOnly;
        pc.sendOnly = sendOnly;
        pc.listen('stats', function fireStats(evt) {
            /**
             * This event is fired every time statistical information about audio and/or video on a call
             * becomes available.
             * @event respoke.Call#stats
             * @type {respoke.Event}
             * @property {respoke.MediaStats} stats - an object with stats in it.
             * @property {respoke.Call} target
             * @property {string} name - the event name.
             */
            that.fire('stats', {stats: evt.stats});
        }, true);

        delete that.signalOffer;
        delete that.signalConnected;
        delete that.signalAnswer;
        delete that.signalHangup;
        delete that.signalReport;
        delete that.signalCandidate;
        delete that.onConnect;
        delete that.onLocalMedia;
        delete that.callSettings;
        delete that.directConnectionOnly;
    }

    /**
     * Answer the call and start the process of obtaining media. This method is called automatically on the caller's
     * side. This method must be called on the callee's side to indicate that the endpoint does wish to accept the
     * call. The app will have a later opportunity, by passing a callback named previewLocalMedia, to approve or
     * reject the call based on whether audio and/or video is working and is working at an acceptable level.
     * @memberof! respoke.Call
     * @method respoke.Call.answer
     * @fires respoke.Call#answer
     * @param {object} [params]
     * @param {respoke.Call.previewLocalMedia} [params.previewLocalMedia] - A function to call if the developer
     * wants to perform an action between local media becoming available and calling approve().
     * @param {respoke.Call.onLocalMedia} [params.onLocalMedia] - Callback for receiving an HTML5 Video
     * element with the local audio and/or video attached.
     * @param {respoke.Call.onConnect} [params.onConnect] - Callback for the remote video element.
     * @param {respoke.Call.onHangup} [params.onHangup] - Callback for when the call is ended, whether or not
     * it was ended in a graceful manner. TODO: add the hangup reason to the Event.
     * @param {respoke.Call.onMute} [params.onMute] - Callback for changing the mute state on any type of media.
     * This callback will be called when media is muted or unmuted.
     * @param {respoke.Call.onAnswer} [params.onAnswer] - Callback for when the callee answers the call.
     * @param {respoke.Call.onRequestingMedia} [params.onRequestingMedia] - Callback for when the app is waiting
     * for the user to give permission to start getting audio or video.
     * @param {respoke.Call.onApprove} [params.onApprove] - Callback for when the user approves local media. This
     * callback will be called whether or not the approval was based on user feedback. I. e., it will be called even if
     * the approval was automatic.
     * @param {respoke.Call.onAllow} [params.onAllow] - Callback for when the browser gives us access to the
     * user's media.  This event gets called even if the allow process is automatic, i. e., permission and media is
     * granted by the browser without asking the user to approve it.
     * @param {boolean} [params.disableTurn] - If true, media is not allowed to flow through relay servers; it is
     * required to flow peer-to-peer. If it cannot, the call will fail.
     * @param {boolean} [params.receiveOnly] - Whether or not we accept media.
     * @param {boolean} [params.sendOnly] - Whether or not we send media.
     * @param {object} [params.constraints] - Information about the media for this call.
     * @param {array} [params.servers] - A list of sources of network paths to help with negotiating the connection.
     */
    that.answer = function (params) {
        params = params || {};
        log.trace('Call.answer');

        if (!defAnswered.promise.isPending()) {
            return;
        }
        defAnswered.resolve();

        /**
         * saveParameters will only be meaningful for the non-initiate,
         * since the library calls this method for the initiate. Developers will use this method to pass in
         * callbacks for the non-initiate.
         */
        saveParameters(params);

        pc.listen('connect', onRemoteStreamAdded, true);
        pc.listen('remote-stream-removed', onRemoteStreamRemoved, true);

        /**
         * @event respoke.Call#answer
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         */
        that.fire('answer');

        /**
         * There are a few situations in which we need to call approve automatically. Approve is for previewing
         * media, so if there is no media (because we are receiveOnly or this is a DirectConnection) we do not
         * need to wait for the developer to call approve().  Secondly, if the developer did not give us a
         * previewLocalMedia callback to call, we will not wait for approval.
         */
        if (receiveOnly !== true && directConnectionOnly === null) {
            doAddVideo(params);
        } else if (typeof previewLocalMedia !== 'function') {
            that.approve();
        }
    };

    /**
     * Accept a request to modify the media on the call. This method should be called within the Call#modify
     * event listener, which gives the developer or website user a chance to see what changes are proposed and
     * to accept or reject them.
     * @memberof! respoke.Call
     * @method respoke.Call.accept
     * @fires respoke.Call#accept
     * @param {object} [params]
     * @param {respoke.Call.previewLocalMedia} [params.previewLocalMedia] - A function to call if the developer
     * wants to perform an action between local media becoming available and calling approve().
     * @param {respoke.Call.onLocalMedia} [params.onLocalMedia] - Callback for receiving an HTML5 Video
     * element with the local audio and/or video attached.
     * @param {respoke.Call.onConnect} [params.onConnect] - Callback for the developer to receive the
     * remote video element.
     * @param {respoke.Call.onHangup} [params.onHangup] - Callback for the developer to be notified about hangup.
     * @param {boolean} [params.disableTurn] - If true, media is not allowed to flow through relay servers; it is
     * required to flow peer-to-peer. If it cannot, the call will fail.
     * @param {boolean} [params.receiveOnly] - Whether or not we accept media.
     * @param {boolean} [params.sendOnly] - Whether or not we send media.
     * @param {object} [params.constraints] - Information about the media for this call.
     * @param {array} [params.servers] - A list of sources of network paths to help with negotiating the connection.
     */
    that.accept = that.answer;

    /**
     * Start the process of network and media negotiation. If the app passes in a callback named previewLocalMedia
     * in order to allow the logged-in person a chance to base their decision to continue the call on whether
     * audio and/or video is working correctly,
     * this method must be called on both sides in order to begin the call. If call.approve() is called, the call
     * will progress as expected. If call.reject() is called, the call will be aborted.
     * @memberof! respoke.Call
     * @method respoke.Call.approve
     * @fires respoke.Call#approve
     */
    that.approve = function () {
        if (!defApproved.promise.isPending()) {
            return;
        }
        log.trace('Call.approve');
        /**
         * @event respoke.Call#approve
         * @type {respoke.Event}
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         */
        that.fire('approve');

        defApproved.resolve(true);
        if (defModify && defModify.promise.isPending()) {
            defModify.resolve(true);
            defModify = undefined;
        }
    };

    /**
     * Listen for the remote side to remove media in the middle of the call.
     * @memberof! respoke.Call
     * @method respoke.Call.onRemoteStreamRemoved
     * @private
     * @param {object}
     */
    function onRemoteStreamRemoved(evt) {
        log.trace('pc event: remote stream removed');
    }

    /**
     * Listen for the remote side to add additional media in the middle of the call.
     * @memberof! respoke.Call
     * @method respoke.Call.onRemoteStreamAdded
     * @private
     * @param {object}
     * @fires respoke.Call#connect
     */
    function onRemoteStreamAdded(evt) {
        log.debug('received remote media', evt);

        videoRemoteElement = document.createElement('video');
        attachMediaStream(videoRemoteElement, evt.stream);
        videoRemoteElement.autoplay = true;
        videoRemoteElement.used = true;
        videoRemoteElement.play();
        /**
         * @event respoke.LocalMedia#connect
         * @type {respoke.Event}
         * @property {Element} element - the HTML5 Video element with the new stream attached.
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         */
        that.fire('connect', {
            element: videoRemoteElement
        });
    }

    /**
     * Start the process of listening for a continuous stream of statistics about the flow of audio and/or video.
     * Since we have to wait for both the answer and offer to be available before starting
     * statistics, the library returns a promise for the stats object. The statistics object does not contain the
     * statistics; rather it contains methods of interacting with the actions of obtaining statistics. To obtain
     * the actual statistics one time, use stats.getStats(); use the onStats callback to obtain a continuous
     * stream of statistics every `interval` seconds.  Returns null if stats module is not loaded.
     * @memberof! respoke.Call
     * @method respoke.Call.getStats
     * @param {object} params
     * @param {number} [params.interval=5000] - How often in milliseconds to fetch statistics.
     * @param {respoke.MediaStatsParser.statsHandler} [params.onStats] - An optional callback to receive
     * the stats. If no callback is provided, the call's report will contain stats but the developer will not
     * receive them on the client-side.
     * @param {respoke.Call.statsSuccessHandler} [params.onSuccess] - Success handler for this invocation of
     * this method only.
     * @param {respoke.Call.errorHandler} [params.onError] - Error handler for this invocation of this method only.
     * @returns {Promise<object>|null}
     */
    function getStats(params) {
        if (pc && pc.getStats) {
            that.listen('stats', params.onStats);
            delete params.onStats;
            return pc.getStats(params);
        }
        return null;
    }
    if (respoke.MediaStats) {
        that.getStats = getStats;
    }

    /**
     * Return local video element with the logged-in endpoint's audio and/or video streams attached to it.
     * @memberof! respoke.Call
     * @method respoke.Call.getLocalElement
     * @returns {Video} An HTML5 video element.
     */
    that.getLocalElement = function () {
        return videoLocalElement;
    };

    /**
     * Return remote video element with the remote endpoint's audio and/or video streams attached to it.
     * @memberof! respoke.Call
     * @method respoke.Call.getRemoteElement
     * @returns {Video} An HTML5 video element.
     */
    that.getRemoteElement = function () {
        return videoRemoteElement;
    };

    /**
     * Create the RTCPeerConnection and add handlers. Process any offer we have already received. This method is called
     * after answer() so we cannot use this method to set up the DirectConnection.
     * @memberof! respoke.Call
     * @method respoke.Call.doAddVideo
     * @todo Find out when we can stop deleting TURN servers
     * @private
     * @param {object} params
     * @param {object} [params.constraints] - getUserMedia constraints
     * @param {respoke.Call.onLocalMedia} [params.onLocalMedia] Callback for receiving an HTML5 Video
     * element with the local audio and/or video attached.
     * @param {respoke.Call.onConnect} [params.onConnect]
     * @param {respoke.Call.onHangup} [params.onHangup]
     * @fires respoke.Call#requesting-media
     * @fires respoke.Call#allow
     * @fires respoke.Call#local-stream-received
     */
    function doAddVideo(params) {
        var stream;
        log.trace('Call.doAddVideo');
        params = params || {};
        saveParameters(params);
        params.constraints = params.constraints || callSettings.constraints;
        params.pc = pc;
        params.instanceId = instanceId;

        stream = respoke.LocalMedia(params);
        stream.listen('requesting-media', function waitAllowHandler(evt) {
            /**
             * The browser is asking for permission to access the User's media. This would be an ideal time
             * to modify the UI of the application so that the user notices the request for permissions
             * and approves it.
             * @event respoke.Call#requesting-media
             * @type {respoke.Event}
             * @property {string} name - the event name.
             * @property {respoke.Call} target
             */
            that.fire('requesting-media');
        }, true);
        stream.listen('allow', function allowHandler(evt) {
            /**
             * The user has approved the request for media. Any UI changes made to remind the user to click Allow
             * should be canceled now. This event is the same as the `onAllow` callback.  This event gets fired
             * even if the allow process is automatic, i. e., permission and media is granted by the browser
             * without asking the user to approve it.
             * @event respoke.Call#allow
             * @type {respoke.Event}
             * @property {string} name - the event name.
             * @property {respoke.Call} target
             */
            that.fire('allow');
        }, true);
        stream.listen('stream-received', function streamReceivedHandler(evt) {
            defMedia.resolve(stream);
            pc.addStream(evt.stream);
            videoLocalElement = evt.element;
            if (typeof previewLocalMedia === 'function') {
                previewLocalMedia(evt.element, that);
            } else {
                that.approve();
            }
            /**
             * @event respoke.Call#local-stream-received
             * @type {respoke.Event}
             * @property {Element} element
             * @property {respoke.LocalMedia} stream
             * @property {string} name - the event name.
             * @property {respoke.Call} target
             */
            that.fire('local-stream-received', {
                element: evt.element,
                stream: stream
            });
        }, true);
        stream.listen('error', function errorHandler(evt) {
            var message = evt.reason;
            that.removeStream({id: stream.id});
            pc.report.callStoppedReason = message;
            /**
             * This event is fired on errors that occur during call setup or media negotiation.
             * @event respoke.Call#error
             * @type {respoke.Event}
             * @property {string} reason - A human readable description about the error.
             * @property {respoke.Call} target
             * @property {string} name - the event name.
             */
            that.fire('error', {
                reason: message
            });
        });
        localStreams.push(stream);
        return stream;
    }

    /**
     * Add a video and audio stream to the existing call. By default, this method adds both video AND audio.
     * If audio is not desired, pass {audio: false}.
     * @memberof! respoke.Call
     * @method respoke.Call.addVideo
     * @param {object} params
     * @param {boolean} [params.audio=true]
     * @param {boolean} [params.video=true]
     * @param {object} [params.constraints] - getUserMedia constraints, indicating the media being requested is
     * an audio and/or video stream.
     * @param {respoke.Call.onLocalMedia} [params.onLocalMedia] Callback for receiving an HTML5 Video
     * element with the local audio and/or video attached.
     * @param {respoke.Call.onConnect} [params.onConnect]
     * @param {respoke.Call.onHangup} [params.onHangup]
     * @param {respoke.Call.mediaSuccessHandler} [params.onSuccess]
     * @param {respoke.Client.errorHandler} [params.onError]
     * @returns {Promise<respoke.LocalMedia>}
     */
    that.addVideo = function (params) {
        log.trace('Call.addVideo');
        params = params || {};
        params.constraints = params.constraints || {video: true, audio: true};
        params.constraints.audio = typeof params.audio === 'boolean' ? params.audio : params.constraints.audio;
        params.constraints.video = typeof params.video === 'boolean' ? params.video : params.constraints.video;
        params.instanceId = instanceId;

        if (!defMedia.promise.isFulfilled()) {
            doAddVideo(params);
        } else {
            pc.startModify({
                constraints: params.constraints
            });
            defModify = Q.defer();
            defModify.promise.then(function modifyAccepted() {
                doAddVideo(params);
            });
        }
        return defModify.promise;
    };

    /**
     * Add an audio stream to the existing call.
     * @memberof! respoke.Call
     * @method respoke.Call.addAudio
     * @param {object} params
     * @param {boolean} [params.audio=true]
     * @param {boolean} [params.video=false]
     * @param {object} [params.constraints] - getUserMedia constraints, indicating the media being requested is
     * an audio and/or video stream.
     * @param {respoke.Call.onLocalMedia} [params.onLocalMedia] Callback for receiving an HTML5 Video
     * element with the local audio and/or video attached.
     * @param {respoke.Call.onConnect} [params.onConnect]
     * @param {respoke.Call.onHangup} [params.onHangup]
     * @param {respoke.Call.mediaSuccessHandler} [params.onSuccess]
     * @param {respoke.Client.errorHandler} [params.onError]
     * @returns {Promise<respoke.LocalMedia>}
     */
    that.addAudio = function (params) {
        params = params || {};
        params.constraints = params.constraints || {video: false, audio: true};
        params.constraints.video = typeof params.constraints.video === 'boolean' ?
            params.constraints.video : false;
        params.constraints.audio = typeof params.audio === 'boolean' ? params.audio : params.constraints.audio;
        params.constraints.video = typeof params.video === 'boolean' ? params.video : params.constraints.video;
        return that.addVideo(params);
    };

    /**
     * Remove a stream from the existing call.
     * @memberof! respoke.Call
     * @method respoke.Call.removeStream
     * @param {object} params
     * @param {boolean} id - the id of the stream to remove.
     */
    that.removeStream = function (params) {
        var savedIndex;
        localStreams.forEach(function eachStream(stream, idx) {
            if (stream.id === params.id) {
                stream.stop();
                savedIndex = idx;
            }
        });
        localStreams.splice(savedIndex, 1);
    };

    /**
     *
     * Get the direct connection on this call, if it exists.
     * @memberof! respoke.Call
     * @method respoke.Call.startDirectConnection
     */
    that.startDirectConnection = function () {
        return directConnection || null;
    };

    /**
     * Remove a direct connection from the existing call. If there is no other media, this will hang up the call.
     * @memberof! respoke.Call
     * @method respoke.Call.removeDirectConnection
     */
    that.removeDirectConnection = function (params) {
        params = params || {};
        log.trace('Call.removeDirectConnection');

        if (directConnection && directConnection.isActive()) {
            directConnection.close({skipRemove: true});
        }

        if (localStreams.length === 0) {
            log.debug('Hanging up because there are no local streams.');
            that.hangup();
            return;
        }

        if (params.skipModify === true) {
            return;
        }

        pc.startModify({
            directConnection: false
        });
        defModify = Q.defer();
        defModify.promise.done(function onModifySuccess() {
            defMedia.resolve();
            defModify = undefined;
        });
    };

    /**
     * Add a direct connection to the existing call.
     * @memberof! respoke.Call
     * @method respoke.Call.addDirectConnection
     * @param {object} params
     * @param {respoke.DirectConnection.onClose} [params.onClose] - Callback for the developer to be notified about
     * closing the connection.
     * @param {respoke.DirectConnection.onOpen} [params.onOpen] - Callback for the developer to be notified about
     * opening the connection.
     * @param {respoke.DirectConnection.onMessage} [params.onMessage] - Callback for the developer to be notified
     * about incoming messages. Not usually necessary to listen to this event if you are already listening to
     * respoke.Endpoint#message.
     * @param {respoke.Call.directConnectionSuccessHandler} [params.onSuccess]
     * @param {respoke.Client.errorHandler} [params.onError]
     * @returns {Promise<respoke.DirectConnection>}
     */
    that.addDirectConnection = function (params) {
        log.trace('Call.addDirectConnection');
        pc.startModify({
            directConnection: true
        });
        defModify = Q.defer();
        return defModify.promise.then(function onModifySuccess() {
            return actuallyAddDirectConnection(params);
        }, function onModifyError(err) {
            throw err;
        });
    };

    /**
     * Add a direct connection to the existing call.
     * @memberof! respoke.Call
     * @method respoke.Call.actuallyAddDirectConnection
     * @private
     * @param {object} params
     * @param {respoke.DirectConnection.onClose} [params.onClose] - Callback for the developer to be notified about
     * closing the connection.
     * @param {respoke.DirectConnection.onOpen} [params.onOpen] - Callback for the developer to be notified about
     * opening the connection.
     * @param {respoke.DirectConnection.onMessage} [params.onMessage] - Callback for the developer to be notified
     * about incoming messages. Not usually necessary to listen to this event if you are already listening to
     * respoke.Endpoint#message.
     * @param {respoke.Call.directConnectionSuccessHandler} [params.onSuccess]
     * @param {respoke.Client.errorHandler} [params.onError]
     * @returns {Promise<respoke.DirectConnection>}
     * @fires respoke.Client#direct-connection
     * @fires respoke.Call#direct-connection
     */
    function actuallyAddDirectConnection(params) {
        log.trace('Call.actuallyAddDirectConnection', params);
        params = params || {};
        defMedia.promise.then(params.onSuccess, params.onError);

        if (directConnection && directConnection.isActive()) {
            if (defMedia.promise.isPending()) {
                defMedia.resolve(directConnection);
            }
            log.warn("Not creating a new direct connection.");
            return defMedia.promise;
        }

        params.instanceId = instanceId;
        params.pc = pc;
        params.call = that;

        directConnection = respoke.DirectConnection(params);

        directConnection.listen('close', function closeHandler() {
            // TODO: make this look for remote streams, too. Don't want to hang up on a one-way media call.
            if (localStreams.length === 0) {
                log.debug('Hanging up because there are no local streams.');
                that.hangup();
            } else {
                if (directConnection && directConnection.isActive()) {
                    that.removeDirectConnection({skipModify: true});
                }
            }
        }, true);

        directConnection.listen('accept', function acceptHandler() {
            if (that.caller === false) {
                log.debug('Answering as a result of approval.');
                that.answer();
                if (defMedia && defMedia.promise.isPending()) {
                    that.approve();
                }
            } else {
                if (defApproved.promise.isPending()) { // This happens on modify
                    defApproved.resolve(true);
                }
                defMedia.resolve(directConnection);
            }
        }, true);

        directConnection.listen('open', function openHandler() {
            directConnectionOnly = null;
        }, true);

        directConnection.listen('error', function errorHandler(err) {
            defMedia.reject(new Error(err));
        }, true);

        that.remoteEndpoint.directConnection = directConnection;

        /**
         * This event is fired when the local end of the directConnection is available. It still will not be
         * ready to send and receive messages until the 'open' event fires.
         * @event respoke.Call#direct-connection
         * @type {respoke.Event}
         * @property {respoke.DirectConnection} directConnection
         * @property {respoke.Endpoint} endpoint
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         */
        that.fire('direct-connection', {
            directConnection: directConnection,
            endpoint: that.remoteEndpoint
        });

        /**
         * This event is fired when the logged-in endpoint is receiving a request to open a direct connection
         * to another endpoint.  If the user wishes to allow the direct connection, calling
         * evt.directConnection.accept() will allow the connection to be set up.
         * @event respoke.Client#direct-connection
         * @type {respoke.Event}
         * @property {respoke.DirectConnection} directConnection
         * @property {respoke.Endpoint} endpoint
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         */
        client.fire('direct-connection', {
            directConnection: directConnection,
            endpoint: that.remoteEndpoint
        });

        if (that.caller === true) {
            directConnection.accept();
        }

        return defMedia.promise;
    }

    /**
     *
     * Close the direct connection.
     * @memberof! respoke.Call
     * @method respoke.Call.closeDirectConnection
     */
    that.closeDirectConnection = function () {
        if (directConnection) {
            directConnection.close();
            directConnection = null;
        }
    };

    /**
     * Tear down the call, release user media.  Send a hangup signal to the remote party if
     * signal is not false and we have not received a hangup signal from the remote party.
     * @memberof! respoke.Call
     * @method respoke.Call.hangup
     * @fires respoke.Call#hangup
     * @param {object} params
     * @param {boolean} params.signal Optional flag to indicate whether to send or suppress sending
     * a hangup signal to the remote side.
     */
    that.hangup = function (params) {
        params = params || {};
        log.trace('hangup', directConnection);

        if (toSendHangup !== null) {
            log.info("call.hangup() called when call is already hung up.");
            return;
        }
        toSendHangup = false;

        if (!that.caller && defApproved.promise.isPending()) {
            defApproved.reject(new Error("Call hung up before approval."));
        }

        localStreams.forEach(function eachStream(stream) {
            stream.stop();
        });

        if (directConnection && directConnection.isActive()) {
            directConnection.close();
            that.remoteEndpoint.directConnection = null;
        }

        if (pc) {
            toSendHangup = pc.close(params);
        }

        /**
         * This event is fired when the call has hung up.
         * @event respoke.Call#hangup
         * @type {respoke.Event}
         * @property {boolean} sentSignal - Whether or not we sent a 'hangup' signal to the other party.
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         */
        that.fire('hangup', {
            sentSignal: toSendHangup
        });

        that.ignore();
        directConnection = null;
        pc = null;
    };

    /**
     * Expose hangup as reject for approve/reject workflow.
     * @memberof! respoke.Call
     * @method respoke.Call.reject
     * @param {object} params
     * @param {boolean} params.signal Optional flag to indicate whether to send or suppress sending
     * a hangup signal to the remote side.
     */
    that.reject = function (params) {
        if (defModify && defModify.promise.isPending()) {
            defModify.reject(new Error("Modify rejected."));
            defModify = undefined;
        } else {
            that.hangup(params);
        }
    };

    /**
     * Indicate whether a call is being setup or is in progress.
     * @memberof! respoke.Call
     * @method respoke.Call.isActive
     * @returns {boolean}
     */
    that.isActive = function () {
        // TODO: make this look for remote streams, too. Want to make this handle one-way media calls.
        return (pc.isActive() && (
            (localStreams.length > 0) ||
            (directConnection && directConnection.isActive())
        ));
    };

    /**
     * Save the offer so we can tell the browser about it after the PeerConnection is ready.
     * @memberof! respoke.Call
     * @method respoke.Call.listenOffer
     * @param {object} evt
     * @param {object} evt.signal - The offer signal including the sdp
     * @private
     * @fires respoke.Call#modify
     */
    function listenOffer(evt) {
        log.trace('listenOffer');
        var info = {};
        if (defModify && defModify.promise.isPending()) {
            if (directConnectionOnly === true) {
                info.directConnection = directConnection;
            } else if (directConnectionOnly === false) {
                // Nothing
            } else {
                info.call = that;
                info.constraints = callSettings.constraints;
            }
            /**
             * Indicates a request to add something to an existing call. If 'constraints' is set, evt.constraints
             * describes the media the other side has added. In this case, call.approve() must be called in order
             * to approve the new media and send the same type of media.  If directConnection exists, the other side
             * wishes to to open a direct connection. In order to approve, call directConnection.accept(). In either
             * case, call.reject() and directConnection.reject() can be called to decline the request to add to the
             * call.
             * @event respoke.Call#modify
             * @type {respoke.Event}
             * @property {object} [constraints]
             * @property {boolean} [directConnection]
             * @property {string} name - the event name.
             * @property {respoke.Call} target
             */
            that.fire('modify', info);
        }
        defSDPOffer.resolve(evt.signal);
    }

    /**
     * Save the answer and tell the browser about it.
     * @memberof! respoke.Call
     * @method respoke.Call.listenAnswer
     * @param {object} evt
     * @param {object} evt.signal - The offer signal including the sdp and the connectionId of the endpoint who
     * answered the call.
     * @private
     */
    function listenAnswer(evt) {
        log.trace('Call.listenAnswer');
        if (defSDPAnswer.promise.isFulfilled()) {
            log.debug("Ignoring duplicate answer.");
            return;
        }
        defSDPAnswer.resolve(evt.signal.sdp);
    }

    /**
     * Save the answer and tell the browser about it.
     * @memberof! respoke.Call
     * @method respoke.Call.listenModify
     * @private
     */
    function listenModify(evt) {
        log.trace('Call.listenModify', evt);
        if (evt.signal.action === 'initiate') {
            defModify = Q.defer();
        }
    }

    /**
     * Set up state and media for the modify.
     * @memberof! respoke.Call
     * @method respoke.Call.onModifyAccept
     * @param {respoke.Event} evt
     * @private
     */
    function onModifyAccept(evt) {
        that.caller = evt.signal.action === 'initiate' ? false : true;
        init();

        if (evt.signal.action !== 'initiate') {
            defModify.resolve(); // resolved later for callee
            defModify = undefined;
            return;
        }

        // callee only from here down

        // init the directConnection if necessary. We don't need to do anything with
        // audio or video right now.
        if (evt.signal.directConnection === true) {
            actuallyAddDirectConnection().done(function successHandler(dc) {
                directConnection = dc;
                directConnection.accept();
            });
        } else if (evt.signal.directConnection === false) {
            if (directConnection) {
                that.removeDirectConnection({skipModify: true});
                defMedia.resolve(false);
                defApproved.resolve(false);
            }
        }
        directConnectionOnly = typeof evt.signal.directConnection === 'boolean' ? evt.signal.directConnection : null;
        callSettings.constraints = evt.signal.constraints || callSettings.constraints;
    }

    /**
     * Ignore the modify.
     * @memberof! respoke.Call
     * @method respoke.Call.onModifyReject
     * @param {respoke.Event} evt
     * @param {Error} evt.err
     * @private
     */
    function onModifyReject(evt) {
        if (evt.signal.action !== 'initiate') {
            defMedia.reject(evt.err);
            defModify.reject(evt.err);
            defModify = undefined;
        }
    }

    /**
     * If video is muted, unmute. If not muted, mute.
     * @deprecated
     * @memberof! respoke.Call
     * @method respoke.Call.toggleVideo
     */
    that.toggleVideo = function () {
        if (that.isActive()) {
            if (!videoIsMuted) {
                that.muteVideo();
            } else {
                that.unmuteVideo();
            }
        }
    };

    /**
     * If audio is muted, unmute. If not muted, mute.
     * @deprecated
     * @memberof! respoke.Call
     * @method respoke.Call.toggleAudio
     */
    that.toggleAudio = function () {
        if (that.isActive()) {
            if (!audioIsMuted) {
                that.muteAudio();
            } else {
                that.unmuteAudio();
            }
        }
    };

    /**
     * Mute all local video streams.
     * @memberof! respoke.Call
     * @method respoke.Call.muteVideo
     * @fires respoke.Call#mute
     */
    that.muteVideo = function () {
        if (videoIsMuted) {
            return;
        }
        localStreams.forEach(function muteAllVideo(stream) {
            stream.muteVideo();
        });
        /**
         * This event indicates that local video has been muted.
         * @event respoke.Call#mute
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         * @property {string} type - Either "audio" or "video" to specify the type of stream whose muted state
         * has been changed.
         * @property {boolean} muted - Whether the stream is now muted. Will be set to false if mute was turned off.
         */
        that.fire('mute', {
            type: 'video',
            muted: true
        });
        videoIsMuted = true;
    };

    /**
     * Unmute all local video streams.
     * @memberof! respoke.Call
     * @method respoke.Call.unmuteVideo
     * @fires respoke.Call#mute
     */
    that.unmuteVideo = function () {
        if (!videoIsMuted) {
            return;
        }
        localStreams.forEach(function unmuteAllVideo(stream) {
            stream.unmuteVideo();
        });
        /**
         * This event indicates that local video has been unmuted.
         * @event respoke.Call#mute
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         * @property {string} type - Either "audio" or "video" to specify the type of stream whose muted state
         * has been changed.
         * @property {boolean} muted - Whether the stream is now muted. Will be set to false if mute was turned off.
         */
        that.fire('mute', {
            type: 'video',
            muted: false
        });
        videoIsMuted = false;
    };

    /**
     * Mute all local audio streams.
     * @memberof! respoke.Call
     * @method respoke.Call.muteAudio
     * @fires respoke.Call#mute
     */
    that.muteAudio = function () {
        if (audioIsMuted) {
            return;
        }
        localStreams.forEach(function muteAllAudio(stream) {
            stream.muteAudio();
        });
        /**
         * This event indicates that local audio has been muted.
         * @event respoke.Call#mute
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         * @property {string} type - Either "audio" or "video" to specify the type of stream whose muted state
         * has been changed.
         * @property {boolean} muted - Whether the stream is now muted. Will be set to false if mute was turned off.
         */
        that.fire('mute', {
            type: 'audio',
            muted: true
        });
        audioIsMuted = true;
    };

    /**
     * Unmute all local audio streams.
     * @memberof! respoke.Call
     * @method respoke.Call.unmuteAudio
     * @fires respoke.Call#mute
     */
    that.unmuteAudio = function () {
        if (!audioIsMuted) {
            return;
        }

        localStreams.forEach(function unmuteAllAudio(stream) {
            stream.unmuteAudio();
        });

        /**
         * This event indicates that local audio has been unmuted.
         * @event respoke.Call#mute
         * @property {string} name - the event name.
         * @property {respoke.Call} target
         * @property {string} type - Either "audio" or "video" to specify the type of stream whose muted state
         * has been changed.
         * @property {boolean} muted - Whether the stream is now muted. Will be set to false if mute was turned off.
         */
        that.fire('mute', {
            type: 'audio',
            muted: false
        });
        audioIsMuted = false;
    };

    /**
     * Save the hangup reason and hang up.
     * @memberof! respoke.Call
     * @method respoke.Call.listenHangup
     * @params {object} evt
     * @params {object} evt.signal - The hangup signal, including an optional hangup reason.
     * @private
     */
    function listenHangup(evt) {
        pc.report.callStoppedReason = evt.signal.reason || "Remote side hung up";
        that.hangup({signal: false});
    }

    that.listen('signal-offer', listenOffer, true);
    that.listen('signal-answer', listenAnswer, true);
    that.listen('signal-hangup', listenHangup, true);
    that.listen('signal-modify', listenModify, true);
    pc.listen('modify-reject', onModifyReject, true);
    pc.listen('modify-accept', onModifyAccept, true);
    that.listen('signal-icecandidates', function onCandidateSignal(evt) {
        if (!evt.signal.iceCandidates || !evt.signal.iceCandidates.length) {
            return;
        }
        evt.signal.iceCandidates.forEach(function processCandidate(candidate) {
            pc.addRemoteCandidate({candidate: candidate});
        });
    }, true);

    setTimeout(function initTimeout() {
        saveParameters(params);
        init();
    }, 0);
    return that;
}; // End respoke.Call

/**
 * Handle an error that resulted from a method call.
 * @callback respoke.Call.errorHandler
 * @param {Error} err
 */
/**
 * Handle the successful kick-off of stats on a call.
 * @callback respoke.Call.statsSuccessHandler
 * @param {respoke.MediaStatsParser} statsParser
 */
/**
 * Handle obtaining media successfully.
 * @callback respoke.Call.mediaSuccessHandler
 * @param {respoke.LocalMedia} localMedia
 */
/**
 * When on a call, receive local media when it becomes available. This is what you will need to provide if you want
 * to show the user their own video during a call. This callback is called every time
 * respoke.Call#local-stream-received is fired.
 * @callback respoke.Call.onLocalMedia Callback for receiving an HTML5 Video
 * element with the local audio and/or video attached.
 * @param {respoke.Event} evt
 * @param {Element} evt.element
 * @param {respoke.LocalMedia} evt.stream
 * @param {string} evt.name - the event name.
 * @param {respoke.Call} evt.target
 */
/**
 * When on a call, receive remote media when it becomes available. This is what you will need to provide if you want
 * to show the user the other party's video during a call. This callback is called every time
 * respoke.Call#connect is fired.
 * @callback respoke.Call.onConnect
 * @param {respoke.Event} evt
 * @param {Element} evt.element - the HTML5 Video element with the new stream attached.
 * @param {string} evt.name - the event name.
 * @param {respoke.Call} evt.target
 */
/**
 * When a call is in setup or media renegotiation happens. This callback will be called every time
 * respoke.Call#error.
 * @callback respoke.Call.onError
 * @param {respoke.Event} evt
 * @param {boolean} evt.reason - A human-readable description of the error.
 * @param {string} evt.name - the event name.
 * @param {respoke.Call} evt.target
 */
/**
 * When on a call, receive notification the call has been hung up. This callback is called every time
 * respoke.Call#hangup is fired.
 * @callback respoke.Call.onHangup
 * @param {respoke.Event} evt
 * @param {boolean} evt.sentSignal - Whether or not we sent a 'hangup' signal to the other party.
 * @param {string} evt.name - the event name.
 * @param {respoke.Call} evt.target
 */
/**
 * Called when changing the mute state on any type of media. This callback will be called when media is muted or
 * unmuted. This callback is called every time respoke.Call#mute is fired.
 * @callback respoke.Call.onMute
 * @param {respoke.Event} evt
 * @param {respoke.Call} evt.target
 */
/**
 * Called when the callee answers the call. This callback is called every time respoke.Call#answer is fired.
 * @callback respoke.Call.onAnswer
 * @param {respoke.Event} evt
 * @param {respoke.Call} evt.target
 */
/**
 * Called when the user approves local media. This callback will be called whether or not the approval was based
 * on user feedback. I. e., it will be called even if the approval was automatic. This callback is called every time
 * respoke.Call#approve is fired.
 * @callback respoke.Call.onApprove
 * @param {respoke.Event} evt
 * @param {respoke.Call} evt.target
 */
/**
 * When setting up a call, receive notification that the browser has granted access to media.  This callback is
 * called every time respoke.Call#allow is fired.
 * @callback respoke.Call.onAllow
 * @param {respoke.Event} evt
 * @param {string} evt.name - the event name.
 * @param {respoke.Call} evt.target
 */
/**
 * When setting up a call, receive notification that the app has asked the browser for permission to get audio or
 * video and is waiting on the browser to grant or reject permission. This callback will be called every time
 * respoke.Call#requesting-media is fired.
 * @callback respoke.Call.onRequestingMedia
 * @param {respoke.Event} evt
 * @param {string} evt.name - the event name.
 * @param {respoke.Call} evt.target
 */
/**
 * The use of stats requires an additional module to Respoke. When on a call, receive periodic statistical
 * information about the call, including the codec, lost packets, and bandwidth being consumed. This callback is
 * called every time respoke.Call#stats is fired.
 * @callback respoke.MediaStatsParser.statsHandler
 * @param {respoke.Event} evt
 * @param {respoke.MediaStats} evt.stats - an object with stats in it.
 * @param {respoke.Call} evt.target
 * @param {string} evt.name - the event name.
 */
/**
 * When on a call, receive local media when it becomes available. This is what you will need to provide if you want
 * to allow the user to preview and approve or reject their own video before a call. If this callback is provided,
 * Respoke will wait for call.answer() to be called before proceeding. If this callback is not provided,
 * Respoke will proceed without waiting for user input. This callback is called every time
 * respoke.Call#local-stream-received is fired.
 * @callback respoke.Call.previewLocalMedia
 * @param {object} element - the HTML5 Video element with the new stream attached.
 * @param {respoke.Call} call
 */
/**
 * Receive the DirectConnection.
 * @callback respoke.Call.directConnectionSuccessHandler
 * @param {respoke.DirectConnection} directConnection
 */