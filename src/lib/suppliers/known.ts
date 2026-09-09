/**
 * Leverantörer the customer commonly wants to cancel — Swedish telecom,
 * energy and alarm providers plus the media/web/directory agencies that
 * make up the bulk of mediacleaning cases.
 *
 * Each entry carries the notice address the cancellation is posted to, and
 * where it is known the supplier's own organisationsnummer, which the letter
 * names alongside it. Most numbers are still owed by the client, so the field
 * is blank rather than guessed: a wrong identity number on a cancellation is
 * worse than none. Seeded into the supplier table on first use; anything a
 * seller adds afterwards lives only there.
 *
 * Names are unique: "Advago AB" and "Advago AB (EasyPartner)" share an
 * address but are separate brands, so both stay in the list.
 */
export const KNOWN_SUPPLIERS: { name: string; organizationNumber: string; noticeAddress: string }[] = [
  { name: "AdAccess AB", organizationNumber: "", noticeAddress: "Box 392, 501 13 Borås" },
  { name: "Addictive Group Media AB", organizationNumber: "", noticeAddress: "Gustavslundsvägen 141, 167 51 Bromma" },
  { name: "Advago AB", organizationNumber: "", noticeAddress: "Stora Gatan 11, 731 31 Köping" },
  { name: "Advago AB (EasyPartner)", organizationNumber: "", noticeAddress: "Stora Gatan 11, 731 31 Köping" },
  { name: "AIM Partner AB", organizationNumber: "556849-5906", noticeAddress: "Rosenborgsgatan 12, 169 74 Solna" },
  { name: "AJT Sweden AB", organizationNumber: "", noticeAddress: "Pomonagatan 1, 169 73 Solna" },
  { name: "Allonge AB", organizationNumber: "", noticeAddress: "Box 696 Kocksg 49, 116 29 Stockholm" },
  { name: "Apporté AB", organizationNumber: "", noticeAddress: "Erik Dahlbergsgatan 23 Lgh 1101, 115 32 Stockholm" },
  { name: "Bolagskollen AB (Tryggaval.se)", organizationNumber: "", noticeAddress: "Karlavägen 18 BV, 114 31 Stockholm" },
  { name: "Bovra Technologies AB", organizationNumber: "", noticeAddress: "Engelbrektsgatan 5, 114 32 Stockholm" },
  { name: "BraByggare Sverige AB", organizationNumber: "", noticeAddress: "Sankt Eriksgatan 46A, 112 34 Stockholm" },
  { name: "Branschvinnare i Sverige AB (Sverigesvinnare.se)", organizationNumber: "", noticeAddress: "Alviksvägen 25, 167 17 Bromma" },
  { name: "Commercial and Brands Sweden AB", organizationNumber: "", noticeAddress: "Mailbox 1521, 411 41 Göteborg" },
  { name: "Connected CMS Webbyrå AB (cms.se)", organizationNumber: "", noticeAddress: "Box 55157, 501 14 Borås" },
  { name: "Contactmedia Sverige AB", organizationNumber: "", noticeAddress: "Krokslätts Fabriker 30, 431 37 Mölndal" },
  { name: "Dorunner AB", organizationNumber: "", noticeAddress: "Karlavägen 50, 114 40 Stockholm" },
  { name: "E.ON Energilösningar AB", organizationNumber: "", noticeAddress: "205 09 Malmö" },
  { name: "Effektive Group Sverige AB", organizationNumber: "", noticeAddress: "Varedsvägen 32, 504 64 Borås" },
  { name: "Eniro Group AB (Eniro.se)", organizationNumber: "", noticeAddress: "Kistagången 12, 164 40 Kista" },
  { name: "FFSVEA AB (Förenade Företag)", organizationNumber: "", noticeAddress: "Övägen 1, 216 14 Limhamn" },
  { name: "Fortum Markets AB", organizationNumber: "", noticeAddress: "115 77 Stockholm" },
  { name: "Generaxion AB", organizationNumber: "", noticeAddress: "Rosenborgsgatan 12, 169 74 Solna" },
  { name: "GodEl i Sverige AB", organizationNumber: "", noticeAddress: "Box 121, 101 22 Stockholm" },
  { name: "Hittapunktse AB (Hitta.se)", organizationNumber: "", noticeAddress: "Sankt Eriksgatan 121 D, 113 43 Stockholm" },
  { name: "INTENDIT AB", organizationNumber: "", noticeAddress: "Nordenskiöldsgatan 4, 211 19 Malmö" },
  { name: "Internet.se Svenska AB", organizationNumber: "", noticeAddress: "Gamlestadsvägen 1, 415 11 Göteborg" },
  { name: "JS Mediakonsulter AB", organizationNumber: "", noticeAddress: "Faktorvägen 29, 922 31 Vindeln" },
  { name: "Kvalitetspartner Sverige AB", organizationNumber: "", noticeAddress: "Vretenvägen 13, 171 54 Solna" },
  { name: "Mainztreet Media AB", organizationNumber: "", noticeAddress: "Box 1128, 501 11 Borås" },
  { name: "Mediakonsult1 AB", organizationNumber: "", noticeAddress: "Lilla Brogatan 11, 503 30 Borås" },
  { name: "Mediakonsulterna i Linköping AB", organizationNumber: "", noticeAddress: "Klostergatan 5A, 582 23 Linköping" },
  { name: "Mediaproffs i Nässjö AB", organizationNumber: "", noticeAddress: "Södra Skogsvägen 56, 571 39 Nässjö" },
  { name: "MEDIASE AB", organizationNumber: "", noticeAddress: "Kocksgatan 49, 116 29 Stockholm" },
  { name: "Merinfo Sverige AB", organizationNumber: "", noticeAddress: "Hulda Mellgrens Gata 11B, 421 32 Västra Frölunda" },
  { name: "Modhs Webbyrå AB", organizationNumber: "", noticeAddress: "Östra Storgatan 50, 553 21 Jönköping" },
  { name: "No Sleep AB", organizationNumber: "", noticeAddress: "Sjövikskajen 62, 117 57 Stockholm" },
  { name: "Nordens Hjältar Group AB", organizationNumber: "", noticeAddress: "Box 387, 501 13 Borås" },
  { name: "Nordiska Webbyrån AB", organizationNumber: "", noticeAddress: "Getängsvägen 22E, 504 68 Borås" },
  { name: "Nätvaro AB", organizationNumber: "", noticeAddress: "Hemvärnsgatan 15, 171 54 Solna" },
  { name: "Offerta Group AB", organizationNumber: "", noticeAddress: "Linnégatan 89, 115 23 Stockholm" },
  { name: "Partner i Norden AB", organizationNumber: "", noticeAddress: "Ekbacksvägen 28, 16869 Bromma" },
  { name: "PEAO Webbyrå", organizationNumber: "", noticeAddress: "Starrbäcksgatan 16, 172 74 Sundbyberg" },
  { name: "Project Art Sweden HB (skale.se)", organizationNumber: "", noticeAddress: "Hantverksgatan 28, 302 42 Halmstad" },
  { name: "Reco Sverige AB", organizationNumber: "", noticeAddress: "Vasagatan 15-17, 111 20 Stockholm" },
  { name: "Scrive AB", organizationNumber: "", noticeAddress: "Grev Turegatan 11A, 114 46 Stockholm" },
  { name: "Sector Alarm AB", organizationNumber: "", noticeAddress: "Box 121, 411 15 Göteborg" },
  { name: "Servicefinder Sverige AB", organizationNumber: "", noticeAddress: "Stureplan 4C, 114 35 Stockholm" },
  { name: "Smartproduktion Sverige AB", organizationNumber: "", noticeAddress: "Nedre Tjärna 309, 785 30 Gagnef" },
  { name: "Stilio Media AB", organizationNumber: "", noticeAddress: "Kungsgatan 37, 111 56 Stockholm" },
  { name: "Svensk Annonsförmedling AB", organizationNumber: "", noticeAddress: "Box 5250, 102 45 Stockholm" },
  { name: "Svenskt Bolagsindex AB", organizationNumber: "", noticeAddress: "Box 441, 116 74 Stockholm" },
  { name: "Svenskt Bolagsindex AB (Årets Entreprenörer)", organizationNumber: "", noticeAddress: "Box 441, 116 74 Stockholm" },
  { name: "Tele2 Sverige AB", organizationNumber: "", noticeAddress: "Box 62, 164 94 Kista" },
  { name: "Telenor Sverige AB", organizationNumber: "", noticeAddress: "116 88 Stockholm" },
  { name: "Telia Sverige AB", organizationNumber: "", noticeAddress: "Box 50077, 104 05 Stockholm" },
  { name: "Torggruppen AB", organizationNumber: "", noticeAddress: "Kristian IV:s Väg 3 9tr, 302 50 Halmstad" },
  { name: "Tre (Hi3G Access AB)", organizationNumber: "", noticeAddress: "Box 30213, 104 25 Stockholm" },
  { name: "UC Affärsinformation AB (allabolag.se)", organizationNumber: "", noticeAddress: "Klarabergsviadukten 63, 111 64 Stockholm" },
  { name: "Vattenfall Kundservice", organizationNumber: "", noticeAddress: "162 87 Stockholm" },
  { name: "Verisure Sverige AB", organizationNumber: "", noticeAddress: "Box 121, 581 02 Linköping" },
  { name: "Viewton AB (Connect Studios Sweden)", organizationNumber: "", noticeAddress: "Polhemsgatan 10, 126 30 Stockholm" },
  { name: "VIZIBLY AB", organizationNumber: "", noticeAddress: "Box 1206, 501 12 Borås" },
  { name: "VM Group AB", organizationNumber: "", noticeAddress: "Köpmangatan 29B, 831 30 Östersund" },
  { name: "W Landslaget AB", organizationNumber: "", noticeAddress: "Furusundsgatan 8, 115 37 Stockholm" }
];
