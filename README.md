# react-native-meteor-collection2 #
This project is a port of the Meteor package `aldeed:collection2-core` to make it's functionality available in React Native.

## Supporting the Project ##
If you appreciate the open source work I do, you can help keep me going with a small donation for my time and effort.

[Bitcoin](https://www.coinbase.com/checkouts/4a52f56a76e565c552b6ecf118461287) / [Patreon](https://www.patreon.com/user?u=4866588) / [Paypal](https://www.paypal.me/copleykj)

## Installation ##

Make sure you have the following packages installed from `npm`.

1. react-native-meteor
2. simpl-schema
3. lodash

Then install this package.

```sh
$ npm install --save react-native-meteor-collection2
```

## Basic Usage ##
We'll assume here that you have a working Meteor app and you have an open ddp connection established using `react-native-meteor`;

```javascript
import Collection from 'react-native-meteor-collection2';
import SomeSchema from '../api/SomeCollection/schema.js'; //We'll assume you share schemas with your meteor app
import { ToastAndroid } from react-native

const SomeCollection = new Collection('someCollection');

SomeCollection.attachSchema(SomeSchema);

try {
    SomeCollection.insert({data:"This is test data"});
} catch (e) {
    ToastAndroid.show(`Insert failed, ${e.reason}`, ToastAndroid.LONG)
}
```
