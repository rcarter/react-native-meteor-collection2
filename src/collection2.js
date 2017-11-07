import Meteor, { Collection } from 'react-native-meteor';
import SimpleSchema from 'simpl-schema';
import _ from 'lodash';

SimpleSchema.extendOptions([
    'index',
    'unique',
    'sparse',
    'denyInsert',
    'denyUpdate',
]);

/**
* Mongo.Collection.prototype.attachSchema
* @param {SimpleSchema|Object} ss - SimpleSchema instance or a schema definition object
*    from which to create a new SimpleSchema instance
* @param {Object} [options]
* @param {Boolean} [options.transform=false] Set to `true` if your document must be passed
*    through the collection's transform to properly validate.
* @param {Boolean} [options.replace=false] Set to `true` to replace any existing schema instead of combining
* @return {undefined}
*
* Use this method to attach a schema to a collection created by another package,
* such as Meteor.users. It is most likely unsafe to call this method more than
* once for a single collection, or to call this for a collection that had a
* schema object passed to its constructor.
*/
Collection.prototype.attachSchema = function c2AttachSchema(ss, options = {}) {
    const self = this;

    // Allow passing just the schema object
    if (!(ss instanceof SimpleSchema)) {
        ss = new SimpleSchema(ss);
    }

    self._c2 = self._c2 || {};

    // If we've already attached one schema, we combine both into a new schema unless options.replace is `true`
    if (self._c2._simpleSchema && options.replace !== true) {
        if (ss.version >= 2) {
            const newSS = new SimpleSchema(self._c2._simpleSchema);
            newSS.extend(ss);
            ss = newSS;
        } else {
            ss = new SimpleSchema([self._c2._simpleSchema, ss]);
        }
    }

    const selector = options.selector;

    function attachTo(obj) {
        if (typeof selector === 'object') {
            // Index of existing schema with identical selector
            let schemaIndex = -1;

            // we need an array to hold multiple schemas
            obj._c2._simpleSchemas = obj._c2._simpleSchemas || [];

            // Loop through existing schemas with selectors
            obj._c2._simpleSchemas.forEach(function (schema, index) {
                // if we find a schema with an identical selector, save it's index
                if (_.isEqual(schema.selector, selector)) {
                    schemaIndex = index;
                }
            });
            if (schemaIndex === -1) {
                // We didn't find the schema in our array - push it into the array
                obj._c2._simpleSchemas.push({
                    schema: new SimpleSchema(ss),
                    selector,
                });
            } else {
                // We found a schema with an identical selector in our array,
                if (options.replace !== true) {
                    // Merge with existing schema unless options.replace is `true`
                    if (obj._c2._simpleSchemas[schemaIndex].schema.version >= 2) {
                        obj._c2._simpleSchemas[schemaIndex].schema.extend(ss);
                    } else {
                        obj._c2._simpleSchemas[schemaIndex].schema = new SimpleSchema([obj._c2._simpleSchemas[schemaIndex].schema, ss]);
                    }
                } else {
                    // If options.repalce is `true` replace existing schema with new schema
                    obj._c2._simpleSchemas[schemaIndex].schema = ss;
                }
            }

            // Remove existing schemas without selector
            delete obj._c2._simpleSchema;
        } else {
            // Track the schema in the collection
            obj._c2._simpleSchema = ss;

            // Remove existing schemas with selector
            delete obj._c2._simpleSchemas;
        }
    }

    attachTo(self);
    if (ss.version >= 2) {
        ss.messageBox.messages({
            insertNotAllowed: '{{label}} cannot be set during an insert',
            updateNotAllowed: '{{label}} cannot be set during an update',
        });
    }

    ss.addValidator(function () {
        if (!this.isSet) return;

        const def = this.definition;

        if (def.denyInsert && this.isInsert) return 'insertNotAllowed';
        if (def.denyUpdate && (this.isUpdate || this.isUpsert)) return 'updateNotAllowed';
    });
};

/**
* simpleSchema
* @description function detect the correct schema by given params. If it
* detect multi-schema presence in `self`, then it made an attempt to find a
* `selector` in args
* @param {Object} doc - It could be <update> on update/upsert or document
* itself on insert/remove
* @param {Object} [options] - It could be <update> on update/upsert etc
* @param {Object} [query] - it could be <query> on update/upsert
* @return {Object} Schema
*/
Collection.prototype.simpleSchema = function (doc, options, query) {
    if (!this._c2) return null;
    if (this._c2._simpleSchema) return this._c2._simpleSchema;

    const schemas = this._c2._simpleSchemas;
    if (schemas && schemas.length > 0) {
        if (!doc) throw new Error('collection.simpleSchema() requires doc argument when there are multiple schemas');

        let schema,
            selector,
            target;
        for (let i = 0; i < schemas.length; i++) {
            schema = schemas[i];
            selector = Object.keys(schema.selector)[0];

            // We will set this to undefined because in theory you might want to select
            // on a null value.
            target = undefined;

            // here we are looking for selector in different places
            // $set should have more priority here
            if (doc.$set && typeof doc.$set[selector] !== 'undefined') {
                target = doc.$set[selector];
            } else if (typeof doc[selector] !== 'undefined') {
                target = doc[selector];
            } else if (options && options.selector) {
                target = options.selector[selector];
            } else if (query && query[selector]) { // on upsert/update operations
                target = query[selector];
            }

            // we need to compare given selector with doc property or option to
            // find right schema
            if (target !== undefined && target === schema.selector[selector]) {
                return schema.schema;
            }
        }
    }

    return null;
};

// Wrap DB write operation methods

const methods = ['insert', 'update'];

for (let i = 0, len = methods.length; i < len; i++) {
    const methodName = methods[i];
    console.log(methodName);
    const originalMethodName = `original-${methodName}`;
    const _super = Collection[originalMethodName] || Collection.prototype[methodName];

    Collection[originalMethodName] = _super;

    Collection.prototype[methodName] = function () {
        let self = this,
            options,
            args = [...arguments];

        options = (methodName === 'insert') ? args[1] : args[2];

        // Support missing options arg
        if (!options || typeof options === 'function') {
            options = {};
        }

        if (self._c2 && options.bypassCollection2 !== true) {
            let userId = null;
            try { // https://github.com/aldeed/meteor-collection2/issues/175
                userId = Meteor.userId();
            } catch (err) {}

            args = doValidate.call(
                self,
                methodName,
                args,
                true, // getAutoValues
                userId,
                false, // isFromTrustedCode
            );
            if (!args) {
                // doValidate already called the callback or threw the error so we're done.
                // But insert should always return an ID to match core behavior.
                return methodName === 'insert' ? self._makeNewID() : undefined;
            }
        } else {
            // We still need to adjust args because insert does not take options
            if (methodName === 'insert' && typeof args[1] !== 'function') args.splice(1, 1);
        }
        return _super.apply(self, args);
    };
}

/*
* Private
*/

function doValidate(type, args, getAutoValues, userId, isFromTrustedCode) {
    let self = this,
        doc,
        callback,
        error,
        options,
        isUpsert,
        selector,
        last,
        hasCallback;

    if (!args.length) {
        throw new Error(`${type} requires an argument`);
    }

    // Gather arguments and cache the selector
    if (type === 'insert') {
        doc = args[0];
        options = args[1];
        callback = args[2];

        // The real insert doesn't take options
        if (typeof options === 'function') {
            args = [doc, options];
        } else if (typeof callback === 'function') {
            args = [doc, callback];
        } else {
            args = [doc];
        }
    } else if (type === 'update') {
        selector = args[0];
        doc = args[1];
        options = args[2];
        callback = args[3];
    } else {
        throw new Error('invalid type argument');
    }

    const validatedObjectWasInitiallyEmpty = _.isEmpty(doc);

    // Support missing options arg
    if (!callback && typeof options === 'function') {
        callback = options;
        options = {};
    }
    options = options || {};

    last = args.length - 1;

    hasCallback = (typeof args[last] === 'function');

    // If update was called with upsert:true, flag as an upsert
    isUpsert = (type === 'update' && options.upsert === true);

    // we need to pass `doc` and `options` to `simpleSchema` method, that's why
    // schema declaration moved here
    const schema = self.simpleSchema(doc, options, selector);
    const isLocalCollection = (self._connection === null);


    // Determine validation context
    let validationContext = options.validationContext;
    if (validationContext) {
        if (typeof validationContext === 'string') {
            validationContext = schema.namedContext(validationContext);
        }
    } else {
        validationContext = schema.namedContext();
    }

    // Add a default callback function if we're on the client and no callback was given
    if (!callback) {
        // Client can't block, so it can't report errors by exception,
        // only by callback. If they forget the callback, give them a
        // default one that logs the error, so they aren't totally
        // baffled if their writes don't work because their database is
        // down.
        callback = function (err) {
            if (err) {
                console.log(`${type} failed: ${err.reason || err.stack}`);
            }
        };
    }


    const schemaAllowsId = schema.allowsKey('_id');

    if (type === 'insert' && !doc._id && schemaAllowsId) {
        doc._id = self._makeNewID();
    }

    // Get the docId for passing in the autoValue/custom context
    let docId;
    if (type === 'insert') {
        docId = doc._id; // might be undefined
    } else if (type === 'update' && selector) {
        docId = typeof selector === 'string' || selector._id;
    }

    // If _id has already been added, remove it temporarily if it's
    // not explicitly defined in the schema.
    let cachedId;
    if (doc._id && !schemaAllowsId) {
        cachedId = doc._id;
        delete doc._id;
    }

    function doClean(docToClean, getAutoValues, filter, autoConvert, removeEmptyStrings, trimStrings) {
        // Clean the doc/modifier in place
        schema.clean(docToClean, {
            mutate: true,
            filter,
            autoConvert,
            getAutoValues,
            isModifier: (type !== 'insert'),
            removeEmptyStrings,
            trimStrings,
            extendAutoValueContext: _.extend({
                isInsert: (type === 'insert'),
                isUpdate: (type === 'update' && options.upsert !== true),
                isUpsert,
                userId,
                isFromTrustedCode,
                docId,
                isLocalCollection,
            }, options.extendAutoValueContext || {}),
        });
    }

    // Preliminary cleaning on both client and server. On the server and for local
    // collections, automatic values will also be set at this point.
    doClean(
        doc,
        getAutoValues,
        options.filter !== false,
        options.autoConvert !== false,
        options.removeEmptyStrings !== false,
        options.trimStrings !== false,
    );

    // We clone before validating because in some cases we need
    //  to adjust the
    // object a bit before validating it. If we adjusted `doc` itself, our
    // changes would persist into the database.
    const docToValidate = {};
    for (const prop in doc) {
        // We omit prototype properties when cloning because they will not be valid
        // and mongo omits them when saving to the database anyway.
        if (Object.prototype.hasOwnProperty.call(doc, prop)) {
            docToValidate[prop] = doc[prop];
        }
    }


    doClean(docToValidate, true, false, false, false, false);

    // XXX Maybe move this into SimpleSchema
    if (!validatedObjectWasInitiallyEmpty && _.isEmpty(docToValidate)) {
        throw new Error(`After filtering out keys not in the schema, your ${
            type === 'update' ? 'modifier' : 'object'
        } is now empty`);
    }

    // Validate doc
    let isValid;
    if (options.validate === false) {
        isValid = true;
    } else {
        isValid = validationContext.validate(docToValidate, {
            modifier: (type === 'update' || type === 'upsert'),
            upsert: isUpsert,
            extendedCustomContext: _.extend({
                isInsert: (type === 'insert'),
                isUpdate: (type === 'update' && options.upsert !== true),
                isUpsert,
                userId,
                isFromTrustedCode,
                docId,
                isLocalCollection,
            }, options.extendedCustomContext || {}),
        });
    }

    if (isValid) {
        // Add the ID back
        if (cachedId) {
            doc._id = cachedId;
        }

        // Update the args to reflect the cleaned doc
        // XXX not sure this is necessary since we mutate
        if (type === 'insert') {
            args[0] = doc;
        } else {
            args[1] = doc;
        }

        return args;
    }
    error = getErrorObject(validationContext);
    if (callback) {
        // insert/update/upsert pass `false` when there's an error, so we do that
        callback(error, false);
    } else {
        throw error;
    }
}

function getErrorObject(context) {
    let message;
    const invalidKeys = (typeof context.validationErrors === 'function') ? context.validationErrors() : context.invalidKeys();
    if (invalidKeys.length) {
        message = context.keyErrorMessage(invalidKeys[0].name);
    } else {
        message = 'Failed validation';
    }
    const error = new Error(message);
    error.invalidKeys = invalidKeys;
    error.validationContext = context;

    return error;
}


function addUniqueError(context, errorMessage) {
    const name = errorMessage.split('c2_')[1].split(' ')[0];
    const val = errorMessage.split('dup key:')[1].split('"')[1];

    const addValidationErrorsPropName = (typeof context.addValidationErrors === 'function') ? 'addValidationErrors' : 'addInvalidKeys';
    context[addValidationErrorsPropName]([{
        name,
        type: 'notUnique',
        value: val,
    }]);
}

export default Collection;
