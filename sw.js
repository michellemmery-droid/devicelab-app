var CACHE = "devicelab-shell-29";
var SHELL = [
  "./",
  "./index.html",
  "./app.css?v=29",
  "./app.js?v=29",
  "./map.js?v=29",
  "./config.js?v=29",
  "./halls/hall-1.jpg",
  "./halls/hall-2.jpg",
  "./halls/hall-3.jpg",
  "./halls/hall-4.jpg",
  "./halls/hall-5.jpg",
  "./halls/hall-6.jpg",
  "./halls/hall-7.jpg",
  "./halls/hall-8.jpg",
  "./halls/hall-galeria.jpg",
  "./manifest.json",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(SHELL);
  }));
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key !== CACHE;
    }).map(function (key) {
      return caches.delete(key);
    }));
  }).then(function () {
    return self.clients.claim();
  }));
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(function (response) {
    var copy = response.clone();
    caches.open(CACHE).then(function (cache) {
      cache.put(event.request, copy);
    });
    return response;
  }).catch(function () {
    return caches.match(event.request).then(function (cached) {
      return cached || caches.match("./index.html");
    });
  }));
});
