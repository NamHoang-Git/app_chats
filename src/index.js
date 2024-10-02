import express from "express";
import { engine } from "express-handlebars";

import * as path from "path";
import { fileURLToPath } from "url";

import bodyParser from 'body-parser';
import pkg from 'pg';
const { Pool } = pkg;
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Đường dẫn thư mục hiện tại
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Khởi tạo ứng dụng Express và các thành phần
const app = express();
const http = new Server(app); 
const io = new SocketIOServer(http); 

const pool = new Pool({
    user: 'app_user',
    host: 'localhost',
    database: 'app_chat',
    password: 'password',
    port: 5432,
});

pool.connect((err) => {
    if (err) {
        console.error('Error connecting to PostgreSQL', err);
    } else {
        console.log('Connected to PostgreSQL');
    }
});

// Thiết lập Handlebars làm view engine
app.engine("hbs", engine({
    extname: ".hbs",
	layoutsDir: path.join(__dirname, "resources/views/layouts"),
    partialsDir: path.join(__dirname, "resources/views/partials"),
}));
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "resources/views"));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Route để render trang home
app.get("/", (req, res) => {
	res.render("home", { title: "Home" });
});

// API để lấy danh sách tin nhắn (JSON)
app.get('/messages', async (req, res) => {
	try {
	  	const result = await pool.query('SELECT * FROM messages');
	  	res.json(result.rows);
	} catch (err) {
	  	console.error(err);
	  	res.sendStatus(500);
	}
});

// API để gửi tin nhắn mới
app.post('/messages', async (req, res) => {
    const { name, message } = req.body;
    try {
        const result = await pool.query('INSERT INTO messages (name, message) VALUES ($1, $2) RETURNING id', [name, message]);
        const newMessageId = result.rows[0].id;

        // Gửi tin nhắn đến tất cả các client qua Socket.IO
        const newMessage = { id: newMessageId, name, message }; // Tạo đối tượng tin nhắn mới
        io.emit('message', newMessage); // Gửi tin nhắn qua socket

        res.json({ id: newMessageId }); // Trả về ID cho client
    } catch (error) {
        console.error(error);
        res.status(500).send('Lỗi khi thêm tin nhắn.');
    }
});

// API để xóa tin nhắn
app.delete('/messages/:id', async (req, res) => {
    const messageId = parseInt(req.params.id, 10); // Chuyển đổi thành số nguyên
    if (isNaN(messageId)) {
        return res.status(400).send('ID không hợp lệ.');
    }
    
    try {
        const result = await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);
        if (result.rowCount === 0) {
            return res.status(404).send('Tin nhắn không tìm thấy.');
        }
        res.sendStatus(204); // Thành công
    } catch (error) {
        console.error(error);
        res.status(500).send('Lỗi khi xóa tin nhắn.');
    }
});

// Lắng nghe sự kiện kết nối của Socket.IO
io.on('connection', (socket) => {
	console.log('A user connected');
  
	socket.on('chat message', (msg) => {
		console.log('Message received: ' + msg);
		io.emit('chat message', msg);
	});
  
	socket.on('disconnect', () => {
	  	console.log('A user disconnected');
	});
});

http.listen(3000, '0.0.0.0', () => {
    console.log("express-handlebars example server listening on: 3000");
});

