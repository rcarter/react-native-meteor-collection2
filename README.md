# react-native-meteor-collection2 #
This project is a port of the Meteor package `aldeed:collection2-core` to make it's functionality available in React Native.

## Supporting the Project ##
If you appreciate the open source work I do, you can help keep me going with a small donation for my time and effort.

Litecoin: LXLBD9sC5dV79eQkwj7tFusUHvJA5nhuD3 / [Patreon](https://www.patreon.com/user?u=4866588) / [Paypal](https://www.paypal.me/copleykj)

## Installation ##

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
