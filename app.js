const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const flash = require('connect-flash');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const app = express();
const resendTimer = 15;
const turkeyPhoneRegex = /^5\d{9}$/; // Türkiye telefon numarası regex: 5XXXXXXXXX
let verificationCode = null;
let lastPhoneNumber = null;
let userData = {};
const filePath = path.join(__dirname, 'kullanici_verileri.xlsx');
const photosPath = path.join(__dirname, 'photos');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(
  session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
  })
);
app.use(flash());

// Excel'e veri kaydetme fonksiyonu
const saveToExcel = (data) => {
  let workbook;
  let worksheet;

  if (!fs.existsSync(filePath)) {
    workbook = xlsx.utils.book_new();
    worksheet = xlsx.utils.json_to_sheet([]);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Kullanıcı Verileri');
  } else {
    workbook = xlsx.readFile(filePath);
    worksheet = workbook.Sheets['Kullanıcı Verileri'];
  }

  const jsonData = xlsx.utils.sheet_to_json(worksheet || []);
  jsonData.push(data);

  const newWorksheet = xlsx.utils.json_to_sheet(jsonData);
  workbook.Sheets['Kullanıcı Verileri'] = newWorksheet;
  xlsx.writeFile(workbook, filePath);
};

// Ana sayfa
app.get('/', (req, res) => {
  res.render('index', { messages: req.flash('error') });
});

app.post('/', (req, res) => {
  const { isim, soyisim, il, ilce, meslek } = req.body;
  userData = { isim, soyisim, il, ilce, meslek, fotoSecenekleri: [] };
  res.redirect('/photo-selection');
});

// Fotoğraf seçimi
app.get('/photo-selection', (req, res) => {
  const photos = fs.readdirSync(photosPath);
  res.render('photo_selection', { photos, messages: req.flash('error') });
});

app.post('/photo-selection', (req, res) => {
  const { photos } = req.body;

  if (!photos || photos.length < 2 || photos.length > 3) {
    req.flash('error', 'Lütfen en az 2, en fazla 3 fotoğraf seçin.');
    return res.redirect('/photo-selection');
  }

  userData.fotoSecenekleri = photos;
  res.redirect('/phone-verification');
});

// Telefon doğrulama
app.get('/phone-verification', (req, res) => {
  res.render('phone_verification', { messages: req.flash('error') });
});

app.post('/phone-verification', (req, res) => {
  const { telefon } = req.body;

  if (!turkeyPhoneRegex.test(telefon)) {
    req.flash('error', 'Geçersiz telefon numarası! Lütfen 5XXXXXXXXX formatında bir numara girin.');
    return res.redirect('/phone-verification');
  }

  lastPhoneNumber = telefon;
  verificationCode = Math.floor(1000 + Math.random() * 9000).toString();
  req.session.verificationStartTime = Date.now();
  req.session.telefon = telefon;

  req.flash('success', 'Doğrulama kodu gönderildi! Lütfen kodu girin.');
  res.redirect('/verify-code');
});

// Kod doğrulama
app.get('/verify-code', (req, res) => {
  const remainingTime = Math.max(0, resendTimer - Math.floor((Date.now() - req.session.verificationStartTime) / 1000));
  res.render('verify_code', { remainingTime, messages: req.flash('error') });
});

app.post('/verify-code', (req, res) => {
  const { dogrulamaKodu, telefon } = req.body;

  if (dogrulamaKodu) {
    const elapsedTime = (Date.now() - req.session.verificationStartTime) / 1000;

    if (elapsedTime > resendTimer) {
      req.flash('error', 'Süre doldu. Lütfen kodu tekrar gönderin.');
      return res.redirect('/phone-verification');
    }

    if (dogrulamaKodu === verificationCode) {
      userData.telefon = lastPhoneNumber;
      saveToExcel(userData);
      req.flash('success', 'Doğrulama başarılı! Bilgiler kaydedildi.');
      return res.redirect('/success');
    } else {
      req.flash('error', 'Doğrulama başarısız. Lütfen tekrar deneyin.');
      return res.redirect('/verify-code');
    }
  } else if (telefon) {
    if (!turkeyPhoneRegex.test(telefon)) {
      req.flash('error', 'Geçersiz telefon numarası! Lütfen 5XXXXXXXXX formatında bir numara girin.');
      return res.redirect('/verify-code');
    }

    if (telefon !== lastPhoneNumber) {
      req.flash('error', 'Girilen telefon numarası ilk numaradan farklı! Lütfen tekrar deneyin.');
      return res.redirect('/phone-verification');
    }

    userData.telefon = lastPhoneNumber;
    saveToExcel(userData);
    req.flash('success', 'İşlem başarılı! Bilgiler kaydedildi.');
    res.redirect('/success');
  }
});

// Başarılı doğrulama
app.get('/success', (req, res) => {
  res.render('success', { userData });
});

// Sunucuyu başlat
app.listen(8080, () => {
  console.log('Sunucu 8080 portunda çalışıyor.');
});
