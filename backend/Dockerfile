# SafeGirl backend image
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build || true

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3001

ENV NODE_ENV=development
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const http=require('http'); const port=process.env.PORT||3001; const req=http.get('http://localhost:'+port+'/api/health',(r)=>{if(r.statusCode!==200) process.exit(1); process.exit(0);}); req.on('error',()=>process.exit(1));"

CMD ["node", "dist/server.js"]
