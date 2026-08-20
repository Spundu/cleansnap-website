/**
 * The shared chrome for every non-marketing page: nav, footer, company details.
 *
 * One copy, because the footer carries the statutory trading disclosures
 * (Companies Act 2006 and the Company, Limited Liability Partnership and
 * Business (Names and Trading Disclosures) Regulations 2015: registered name,
 * number, place of registration and registered office). Six pages each holding
 * their own copy of that block is six places for it to go stale — and it is
 * also what Apple checks when an Organization enrolment claims this domain.
 */
(function () {
  'use strict';

  var COMPANY = {
    legalName: 'Aureus Solidus Limited',
    tradingAs: 'CleanSnap',
    number: '17206167',
    registeredIn: 'England and Wales',
    address: 'Flat 1, 16 Churchgate Street, Soham, Ely, Cambridgeshire, CB7 5DS',
    ico: 'ZC205447',
    support: 'support@cleansnap.co.uk',
  };

  var LEGAL_LINKS = [
    ['/terms', 'Terms of Service'],
    ['/privacy', 'Privacy Policy'],
    ['/cookies', 'Cookie Policy'],
    ['/cleaner-agreement', 'Cleaner Agreement'],
  ];

  function nav() {
    return (
      '<nav class="bg-gray-900 w-full">' +
      '<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">' +
      '<div class="flex items-center justify-between h-16">' +
      '<a href="/" class="flex items-center gap-2">' +
      '<img src="/logo.png" alt="CleanSnap" class="w-8 h-8 rounded-lg">' +
      '<span class="text-xl font-bold text-white">CleanSnap</span>' +
      '</a>' +
      '<div class="flex items-center gap-6 text-sm">' +
      '<a href="/support" class="text-white/80 hover:text-white transition">Support</a>' +
      '<a href="/" class="text-white/80 hover:text-white transition">Home</a>' +
      '</div>' +
      '</div></div></nav>'
    );
  }

  function footer() {
    var links = LEGAL_LINKS.map(function (pair) {
      return '<a href="' + pair[0] + '" class="hover:text-white transition">' + pair[1] + '</a>';
    }).join('<span class="text-gray-700 mx-2">·</span>');

    return (
      '<footer class="bg-gray-900 text-gray-400 mt-16">' +
      '<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">' +
      '<div class="flex flex-wrap gap-y-2 text-sm mb-6">' +
      links +
      '<span class="text-gray-700 mx-2">·</span>' +
      '<a href="/support" class="hover:text-white transition">Support</a>' +
      '<span class="text-gray-700 mx-2">·</span>' +
      '<a href="/delete-account" class="hover:text-white transition">Delete your account</a>' +
      '</div>' +
      '<div class="border-t border-gray-800 pt-6 text-xs leading-relaxed">' +
      '<p class="mb-1"><strong class="text-gray-300">' +
      COMPANY.tradingAs +
      '</strong> is a trading name of <strong class="text-gray-300">' +
      COMPANY.legalName +
      '</strong>, a company registered in ' +
      COMPANY.registeredIn +
      ', company number <strong class="text-gray-300">' +
      COMPANY.number +
      '</strong>.</p>' +
      '<p class="mb-1">Registered office: ' +
      COMPANY.address +
      '</p>' +
      '<p class="mb-1">Registered with the Information Commissioner&rsquo;s Office, reference <strong class="text-gray-300">' +
      COMPANY.ico +
      '</strong>.</p>' +
      '<p class="mb-1">Contact: <a class="hover:text-white underline" href="mailto:' +
      COMPANY.support +
      '">' +
      COMPANY.support +
      '</a></p>' +
      '<p class="mt-4 text-gray-500">CleanSnap is a marketplace connecting customers with independent cleaning professionals. We do not provide cleaning services ourselves.</p>' +
      '</div></div></footer>'
    );
  }

  document.addEventListener('DOMContentLoaded', function () {
    var navSlot = document.getElementById('site-nav');
    var footSlot = document.getElementById('site-footer');
    if (navSlot) navSlot.innerHTML = nav();
    if (footSlot) footSlot.innerHTML = footer();
  });
})();
