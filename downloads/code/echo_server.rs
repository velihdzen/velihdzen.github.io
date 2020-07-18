use std::net::{TcpListener, TcpStream};
use std::thread;
use std::io::Read;
use std::io::Write;

pub fn main() {
    let listener = TcpListener::bind("::1:9999").unwrap();

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                thread::spawn(|| {
                    handle_client(stream);
                });
            }
            Err(_) => {
                println!("Error");
            }
        }
    }
}

fn handle_client(mut stream: TcpStream) {
    loop {
        let mut read = [0; 1024];
        match stream.read(&mut read) {
            Ok(n) => {
                if n == 0 {
                    break;
                }
                stream.write(&read[0..n]).unwrap();
            }
            Err(err) => {
                panic!(err);
            }
        }
    }
}