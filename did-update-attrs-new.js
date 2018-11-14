import Ember from 'ember';

const { isEmpty, get } = Ember;

/**
 * due to deprecation of didUpdateAttrs({newAttrs, oldAttrs}) of old and new attrs
 * deprecated in 2.12 until 2.13
 * we need a selective way of keeping track of old and new param changes
 * deprecations: https://www.emberjs.com/deprecations/v2.x/#toc_arguments-in-component-lifecycle-hooks
 * accepted use didUpdateAttrs({attrs}) , we only look at the new attrs and compare with older that we temp store
 * 
 * mixin retains a copy of old values for comparison
 * needs to be a mixin so `this` is the same context as registrant
 * 
 * 
 * USAGE:
 * 
   import DidUpdateAttrsNew from 'app/mixins/did-update-attrs-new';
   export default Ember.Component.extend(DidUpdateAttrsNew, {

    init() {
      this._super(...arguments);
      this.registerDidUpdateAttrsCallback('myKey', this.myKeysCallback, 3); // will call myKeysCallback only when this.get('myKey') === 3
      this.registerDidUpdateAttrsCallback('myKeyA', this.myKeyAorBCallback); // will call myKeyAorBCallback everytime this.get('myKeyA') changes value
      this.registerDidUpdateAttrsCallback('myKeyB', this.myKeyAorBCallback); // can use the same callback for different key updates
    },

    myKeysCallback(newValue) {
      ...
    },

    myKeyAorBCallback(newValue) {
      ...
    }
 * 
 * @extends Ember.Mixin
 */
export default Ember.Mixin.create({
  /**
   * holds all the old property values for comparison with new values
   * @type {Object}
   */
  _oldDidUpdateAttrsValues: null,

  /**
   * init lifecycle method
   * initialize holder for old attribute values
   */
  init() {
    this._super(...arguments);
    this.set('_oldDidUpdateAttrsValues', {});
  },

  /**
   * lifecycle method when component is destroying
   * cleanup `_oldDidUpdateAttrsValues` references
   */
  willDestroy() {
    this._super(...arguments);

    // clean up object holding onto old references
    let oldDidUpdateAttrsValues = this.get('_oldDidUpdateAttrsValues') || {};
    Object.keys(oldDidUpdateAttrsValues).forEach(key => {
      delete oldDidUpdateAttrsValues[key].callback;
      delete oldDidUpdateAttrsValues[key].triggerOnValue;
      delete oldDidUpdateAttrsValues[key].value;
      delete oldDidUpdateAttrsValues[key];
    });
    this.set('_oldDidUpdateAttrsValues', null);
  },

  /**
   * register a callback when a `key` value changes
   * @param {String} key string reference to the property needed to be observed thats passed into didUpdateAttrs
   * @param {Function} callback function to be called when property changes
   * @param {*} triggerOnValue optional: if set, callback will trigger only when value changes to this
   */
  registerDidUpdateAttrsCallback(key, callback, triggerOnValue) {
    if (typeof key === 'string' && callback instanceof Function) {
      let keyCallback = { callback };
      if (arguments.length > 2) { // triggerOnValue has been specified.  Check argument length in case user wants undefined as a trigger
        keyCallback.triggerOnValue = triggerOnValue;
      }
      this.set(`_oldDidUpdateAttrsValues.${key}`, keyCallback);
    } else {
      throw new Error('invalid arguments to registerDidUpdateAttrsCallback');
    }
  },

  /**
   * Called when the attributes passed into the component have been changed.
   * Called only during a rerender, not during an initial render.
   * {attrs} has attributes that are wrapped in an object where the value is found arg.attrs.yourProperty.value
   * @param {Object} arg itterate through the attrs attribute for changes.
   */
  didUpdateAttrs({attrs}) {
    this._super(...arguments);

    let oldRef = key => `_oldDidUpdateAttrsValues.${key}`; // reference to key
    let oldRefValue = key => `${oldRef(key)}.value`; // reference to keys old value
    let getOldRefCallback = key => this.get(`${oldRef(key)}.callback`); // get callback for key
    let getOldRefTriggerOnValue = key => this.get(`${oldRef(key)}.triggerOnValue`); // get triggerOnValue value for key
    let hasTriggerOnValue = key => (this.get(oldRef(key)) || {}).hasOwnProperty('triggerOnValue'); // do we have a specific value to trigger on
    let propertyValue = prop => (!isEmpty(get(prop, 'value')) ? prop.value : prop); // if its an object its most likely wrapped with its target value added inside
    let isNewValueDifferent = (newValue, key) => newValue !== this.get(oldRefValue(key)); // if new value is different than older
    let isPropertyRegistered = key => !isEmpty(getOldRefCallback(key)) && getOldRefCallback(key) instanceof Function; // check if a callback is set for this key
    let triggerRegisteredCallback = (key, newValue) => {
      let callback = getOldRefCallback(key);
      let newValueAllowed = hasTriggerOnValue(key) ? getOldRefTriggerOnValue(key) === newValue : true; // if value is set for this property it has to match
      if (callback instanceof Function && newValueAllowed) { // need a valid callback and newValue to be allowed
        callback.call(this, newValue); // call method in same context since its a mixin
      }
    };
    let compareAndSet = (newValue, key) => { // compare a new value with the old
      if (isPropertyRegistered(key) && isNewValueDifferent(newValue, key)) { // compare new value with the old temp value
        this.set(oldRefValue(key), newValue); // store new value for future comparison
        triggerRegisteredCallback(key, newValue);
      }
    };
    
    Object.keys(attrs).forEach(key => { // compare new attrs with old temp
      compareAndSet(propertyValue(attrs[key]), key);
    });
  }
});
