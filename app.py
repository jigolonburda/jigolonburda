from flask import Flask, render_template, request, redirect, url_for, flash, send_from_directory
import time
from flask import Flask, render_template, request, redirect, url_for, flash, session
import random
import threading
import openpyxl
import os
import re
turkey_phone_regex = r'^5\d{9}$'  

app = Flask(__name__)
app.secret_key = 'your_secret_key'
resend_timer = 15

verification_code = None
user_data = {}
file_path = 'kullanici_verileri.xlsx'
photos_path = 'photos'  


def save_to_excel(data):
    if not os.path.exists(file_path):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Kullanıcı Verileri"
        ws.append(["İsim", "Soyisim", "İl", "İlçe", "Meslek", "Telefon"])
    else:
        wb = openpyxl.load_workbook(file_path)
        ws = wb.active
    
    ws.append([data['isim'], data['soyisim'], data['il'], data['ilce'], data['meslek'], data.get('telefon', '')])
    wb.save(file_path)


@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        isim = request.form.get('isim')
        soyisim = request.form.get('soyisim')
        il = request.form.get('il')
        ilce = request.form.get('ilce')
        meslek = request.form.get('meslek')

        global user_data
        user_data = {
            'isim': isim,
            'soyisim': soyisim,
            'il': il,
            'ilce': ilce,
            'meslek': meslek,
            'foto_secenekleri': []
        }
        return redirect(url_for('photo_selection'))
    return render_template('index.html')


@app.route('/photo-selection', methods=['GET', 'POST'])
def photo_selection():
    photo_list = os.listdir(photos_path)

    if request.method == 'POST':
        selected_photos = request.form.get('photos')  
        if selected_photos:
            selected_photos = eval(selected_photos)  

        
        if not selected_photos or len(selected_photos) < 2 or len(selected_photos) > 3:
            flash("Lütfen en az 2, en fazla 3 fotoğraf seçin.", "danger")
            return redirect(url_for('photo_selection'))

        global user_data
        user_data['foto_secenekleri'] = selected_photos
        return redirect(url_for('phone_verification'))

    return render_template('photo_selection.html', photo_list=photo_list)


@app.route('/photos/<filename>')
def photos(filename):
    return send_from_directory(photos_path, filename)
verification_code = None
resend_timer = 15  
@app.route('/reset-session', methods=['POST'])
def reset_session_post():
    session.clear()
    flash("Oturum sıfırlandı.", "success")
    return redirect(url_for('phone_verification'))
last_phone_number = None  
last_code_sent_time = None  
@app.route('/phone-verification', methods=['GET', 'POST'])
def phone_verification():
    global verification_code, last_phone_number

    if request.method == 'POST':
        telefon = request.form.get('telefon')

        
        if not re.match(turkey_phone_regex, telefon):
            flash("Geçersiz telefon numarası! Lütfen 5XXXXXXXXX formatında bir numara girin.", "danger")
            return redirect(url_for('phone_verification'))

        last_phone_number = telefon  
        verification_code = str(random.randint(1111, 9999))  
        session['verification_start_time'] = time.time()
        session['telefon'] = telefon

        flash("Doğrulama kodu gönderildi! Lütfen kodu girin.", "info")
        return redirect(url_for('verify_code'))

    return render_template('phone_verification.html')


@app.route('/verify-code', methods=['GET', 'POST'])
def verify_code():
    global verification_code, last_phone_number
    if request.method == 'POST':
        if 'dogrulama_kodu' in request.form:
            kullanici_kodu = request.form.get('dogrulama_kodu')
            elapsed_time = time.time() - session.get('verification_start_time', 0)

            if elapsed_time > resend_timer:
                flash("Süre doldu. Lütfen kodu tekrar gönderin.", "warning")
                return redirect(url_for('phone_verification'))

            if kullanici_kodu == verification_code:
                
                global user_data
                user_data['telefon'] = last_phone_number
                save_to_excel(user_data)

                flash("Doğrulama başarılı! Bilgiler kaydedildi.", "success")
                return redirect(url_for('success'))
            else:
                remaining_time = max(0, resend_timer - int(elapsed_time))
                flash(f"Doğrulama başarısız. Lütfen tekrar deneyin. Kalan süre: {remaining_time} saniye.", "danger")
                return redirect(url_for('verify_code'))

        elif 'telefon' in request.form:
            telefon = request.form.get('telefon')

            
            if not re.match(turkey_phone_regex, telefon):
                flash("Geçersiz telefon numarası! Lütfen 5XXXXXXXXX formatında bir numara girin.", "danger")
                return redirect(url_for('verify_code'))

            
            if telefon == last_phone_number:
                flash("İşlem başarılı! Bilgiler kaydedildi.", "success")
                user_data['telefon'] = last_phone_number
                save_to_excel(user_data)
                return redirect(url_for('success'))
            else:
                flash("Girilen telefon numarası ilk numaradan farklı! Lütfen tekrar deneyin.", "danger")
                return redirect(url_for('phone_verification'))

    remaining_time = max(0, resend_timer - int(time.time() - session.get('verification_start_time', 0)))
    return render_template('verify_code.html', remaining_time=remaining_time)


@app.route('/success')
def success():
    return render_template('success.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)