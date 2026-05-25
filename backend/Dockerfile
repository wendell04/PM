FROM dunglas/frankenphp:php8.2-bookworm

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

RUN apt-get update && apt-get install -y git unzip zip libzip-dev && rm -rf /var/lib/apt/lists/*

RUN install-php-extensions mongodb-^1.21 ctype curl dom fileinfo filter hash mbstring openssl pcre pdo session tokenizer xml zip

COPY composer.json composer.lock artisan ./
RUN composer install --optimize-autoloader --no-scripts --no-interaction

COPY . .

COPY Caddyfile /etc/caddy/Caddyfile

RUN mkdir -p storage/framework/{sessions,views,cache,testing} storage/logs bootstrap/cache \
    && chmod -R 777 storage bootstrap/cache

EXPOSE 80 443 8080

CMD ["frankenphp", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
