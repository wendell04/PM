FROM dunglas/frankenphp:php8.2-bookworm

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /app

RUN apt-get update && apt-get install -y git unzip zip libzip-dev && rm -rf /var/lib/apt/lists/*

RUN install-php-extensions mongodb-^1.21 ctype curl dom fileinfo filter hash mbstring openssl pcre pdo session tokenizer xml zip

COPY composer.json composer.lock artisan ./
RUN composer install --optimize-autoloader --no-scripts --no-interaction

COPY . .

COPY php-uploads.ini /usr/local/etc/php/conf.d/zz-uploads.ini

COPY Caddyfile /etc/caddy/Caddyfile

RUN mkdir -p storage/framework/{sessions,views,cache,testing} storage/logs bootstrap/cache \
    && chmod -R 777 storage bootstrap/cache

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80 443 8080

# The entrypoint starts Laravel's scheduler beside the web server and then hands over to it, so the
# container still is the web server - it just is not ONLY the web server. Nothing called
# schedule:run before this, and every scheduled job had never run.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["frankenphp", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
