
var expect = chai.expect;

var client = brightstream.Client();

describe("A brightstream.User ", function () {
    var user = brightstream.User({
        "client": client.getID(),
        "name": "Mickey Mouse",
        "id": "JH5K34J5K34J3453K4J53K45",
        "gloveColor": "white"
    });

    /*
    * Inheritance
    */
    it("extends brightstream.EventEmitter.", function () {
        expect(typeof user.listen).to.equal('function');
        expect(typeof user.ignore).to.equal('function');
        expect(typeof user.fire).to.equal('function');
    });

    it("extends brightstream.Presentable.", function () {
        expect(typeof user.getID).to.equal('function');
        expect(typeof user.getName).to.equal('function');
        expect(typeof user.getPresence).to.equal('function');
        expect(typeof user.setPresence).to.equal('function');
    });

    /*
    * Make sure there is a className attribute on every instance.
    */
    it("has the correct class name.", function () {
        expect(user.className).to.equal('brightstream.User');
    });

    /*
    * Native methods
    */
    it("contains some important methods.", function () {
        expect(typeof user.addCall).to.equal('function');
        expect(typeof user.removeCall).to.equal('function');
        expect(typeof user.setOnline).to.equal('function');
    });

    /*
    * Presence
    */
    it("tries to set presence and errors because of lack of connection", function (done) {
        var newPresence = 'xa';

        user.setPresence({
            presence: newPresence,
            onSuccess: function () {
                done(new Error("User presence succeeded with no connection!"));
            },
            onError: function (err) {
                expect(err.message).to.contain("no connection");
                done();
            }
        });
    });

    /*
    * Constructor
    */
    it("saves unexpected developer-specified parameters.", function () {
        expect(user.gloveColor).to.equal('white');
    });

    it("doesn't expose the signaling channel", function () {
        expect(user.signalingChannel).to.not.exist;
        expect(user.getSignalingChannel).to.not.exist;
    });

    it("has a user session.", function () {
        var userSession = user.getUserSession();
        expect(userSession).to.not.equal(undefined);
        expect(userSession.timeLoggedIn).to.not.equal(undefined);
    });
});
